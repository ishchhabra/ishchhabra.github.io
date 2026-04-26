import {
  BranchTermOp,
  ForTermOp,
  IfTermOp,
  JumpTermOp,
  LiteralOp,
  SwitchTermOp,
  type TPrimitiveValue,
  WhileTermOp,
} from "../../ir";
import { Edge, threadEdgeThroughEmptyJump } from "../../ir/cfg";
import type { BasicBlock } from "../../ir/core/Block";
import type { FuncOp } from "../../ir/core/FuncOp";
import {
  successorArgValues,
  TermOp,
  type ControlFlowFacts,
  type Equality,
  type Truthiness,
} from "../../ir/core/TermOp";
import type { Value } from "../../ir/core/Value";
import { isDCERemovable } from "../../ir/effects/predicates";
import { BaseOptimizationPass, type OptimizationResult } from "../late-optimizer/OptimizationPass";

/**
 * Simplifies control-flow structure after value optimizations have made
 * branch outcomes or jump targets obvious.
 *
 * @remarks
 * This pass removes control-flow scaffolding without changing expression
 * semantics. It folds constant conditional dispatch, removes
 * zero-iteration loops whose tests are safe to drop, threads empty
 * jump-only blocks, and deletes blocks left unreachable by those
 * rewrites.
 *
 * The pass is conservative around structured control. A loop is removed
 * only when its test is known false and evaluating that test has no
 * observable behavior. Value-level cleanup is intentionally left to
 * SCCP/constant propagation, DCE, and copy propagation.
 *
 * @example
 * ```js
 * if (true) {
 *   run();
 * } else {
 *   skip();
 * }
 *
 * // becomes
 * run();
 * ```
 *
 * @example
 * ```js
 * while (false) {
 *   run();
 * }
 *
 * // becomes
 * // nothing
 * ```
 *
 * @example
 * ```js
 * while (console.log("test"), false) {
 *   run();
 * }
 *
 * // stays as-is because removing the loop would remove console.log.
 * ```
 *
 * @see {@link ConstantPropagationPass} for discovering constant branch conditions.
 * @see {@link threadEdgeThroughEmptyJump} for SSA-aware jump threading.
 */
export class CFGSimplificationPass extends BaseOptimizationPass {
  protected step(): OptimizationResult {
    const folded = this.foldTerminators();
    const threaded = this.threadEmptyJumpBlocks();
    const removed = this.removeUnreachableBlocks();
    return { changed: folded || threaded || removed };
  }

  private foldTerminators(): boolean {
    let changed = false;
    for (const block of this.funcOp.blocks) {
      const terminal = block.terminal;
      if (terminal === undefined) continue;
      const replacement = this.simplifyTerminator(terminal);
      if (replacement === undefined) continue;
      block.replaceOp(terminal, replacement);
      changed = true;
    }
    return changed;
  }

  private simplifyTerminator(term: TermOp): JumpTermOp | undefined {
    if (term instanceof BranchTermOp) return undefined;
    if (term instanceof ForTermOp) return this.simplifyFor(term);
    if (term instanceof WhileTermOp) return this.simplifyWhile(term);
    if (!(term instanceof IfTermOp) && !(term instanceof SwitchTermOp)) return undefined;

    const taken = term.takenSuccessorIndices(this.controlFlowFacts);
    if (taken.length === 1) {
      return this.jumpTo(term, taken[0]);
    }

    const runtimeSuccessors = term.successorIndices();
    if (runtimeSuccessors.length === 0) return undefined;
    const first = term.target(runtimeSuccessors[0]).block;
    if (
      first.params.length === 0 &&
      runtimeSuccessors.every((index) => term.target(index).block === first)
    ) {
      return new JumpTermOp(term.id, first, []);
    }
    return undefined;
  }

  private simplifyFor(term: ForTermOp): JumpTermOp | undefined {
    const branch = this.removableFalseLoopBranch(term.testBlock, term.exitBlock);
    return branch === undefined ? undefined : new JumpTermOp(term.id, term.exitBlock, branch.falseArgs);
  }

  private simplifyWhile(term: WhileTermOp): JumpTermOp | undefined {
    if (term.kind !== "while") return undefined;
    const branch = this.removableFalseLoopBranch(term.testBlock, term.exitBlock);
    return branch === undefined ? undefined : new JumpTermOp(term.id, term.exitBlock, branch.falseArgs);
  }

  private jumpTo(term: TermOp, targetIndex: number): JumpTermOp {
    const target = term.target(targetIndex);
    if (target.args.length !== target.block.params.length) {
      throw new Error(
        `${term.constructor.name} target ${targetIndex} has ${target.args.length} args for ` +
          `bb${target.block.id}(${target.block.params.length} params)`,
      );
    }
    return new JumpTermOp(term.id, target.block, successorArgValues(target.args));
  }

  private threadEmptyJumpBlocks(): boolean {
    let changed = false;
    for (const block of this.funcOp.blocks) {
      const terminal = block.terminal;
      if (!(terminal instanceof JumpTermOp)) continue;
      const targetBlock = terminal.targetBlock;
      if (!this.isThreadableEmptyJumpBlock(targetBlock)) continue;
      if (!threadEdgeThroughEmptyJump(new Edge(block, 0, this.funcOp))) continue;
      changed = true;
    }
    return changed;
  }

  private isThreadableEmptyJumpBlock(block: BasicBlock): boolean {
    if (block === this.funcOp.entryBlock) return false;
    if (this.hasStructuredTargetUse(block)) return false;
    if (block.operations.length !== 0) return false;
    const terminal = block.terminal;
    if (!(terminal instanceof JumpTermOp)) return false;
    return terminal.targetBlock !== block;
  }

  private hasStructuredTargetUse(block: BasicBlock): boolean {
    for (const use of block.uses) {
      if (use instanceof JumpTermOp || use instanceof BranchTermOp) continue;
      return true;
    }
    return false;
  }

  private removeUnreachableBlocks(): boolean {
    const reachable = this.reachableBlocks();
    const unreachable = this.funcOp.blocks.filter(
      (block) => block !== this.funcOp.entryBlock && !reachable.has(block),
    );
    if (unreachable.length === 0) return false;

    for (const block of unreachable) {
      this.funcOp.removeBlock(block);
    }
    return true;
  }

  private reachableBlocks(): Set<BasicBlock> {
    const reachable = new Set<BasicBlock>();
    const stack = [this.funcOp.entryBlock];

    while (stack.length > 0) {
      const block = stack.pop()!;
      if (reachable.has(block)) continue;
      reachable.add(block);

      const terminal = block.terminal;
      if (terminal === undefined) continue;
      for (let index = 0; index < terminal.targetCount(); index++) {
        stack.push(terminal.target(index).block);
      }
    }

    return reachable;
  }

  private truthiness(value: Value): boolean | undefined {
    const constant = this.constant(value);
    return constant === undefined ? undefined : Boolean(constant);
  }

  private readonly controlFlowFacts: ControlFlowFacts = {
    truthiness: (value): Truthiness => {
      const constant = this.constant(value);
      return constant === undefined ? "unknown" : Boolean(constant);
    },
    strictEqual: (left, right): Equality => {
      const leftConstant = this.constant(left);
      const rightConstant = this.constant(right);
      if (leftConstant === undefined || rightConstant === undefined) return "unknown";
      return Object.is(leftConstant, rightConstant);
    },
  };

  private removableFalseLoopBranch(
    testBlock: BasicBlock,
    exitBlock: BasicBlock,
  ): BranchTermOp | undefined {
    if (!testBlock.operations.every((op) => isDCERemovable(op, this.funcOp.moduleIR.environment))) {
      return undefined;
    }
    const terminal = testBlock.terminal;
    if (!(terminal instanceof BranchTermOp)) return undefined;
    if (terminal.falseTarget !== exitBlock) return undefined;
    if (this.truthiness(terminal.cond) !== false) return undefined;
    if (terminal.falseArgs.length !== exitBlock.params.length) return undefined;
    if (terminal.falseArgs.some((arg) => arg.def?.parentBlock === testBlock)) return undefined;
    return terminal;
  }

  private constant(value: Value): TPrimitiveValue | undefined {
    const def = value.def;
    return def instanceof LiteralOp ? def.value : undefined;
  }
}
