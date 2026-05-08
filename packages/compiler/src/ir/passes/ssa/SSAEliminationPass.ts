import { AnalysisManager, PreservedAnalyses } from "../../analysis";
import { DeclarationId, FunctionIR, Value } from "../../core";
import { BasicBlock } from "../../core/Block";
import { IRIdAllocator } from "../../core/IRIdAllocator";
import { BlockTarget, TerminatorOp } from "../../core/TerminatorOp";
import { JumpTerminatorOp } from "../../ops/control/JumpTerminatorOp";
import { FunctionPass, PassResult } from "../Pass";
import { ParallelCopy, scheduleParallelCopies } from "./ParallelCopyScheduler";

export interface SSAEliminationPassOptions {
  /**
   * Allocator used for copy operations and edge-splitting blocks.
   *
   * The pass does not own ids; the pipeline supplies the compilation-wide
   * allocator so generated operations and blocks stay unique across the whole
   * IR graph.
   */
  readonly ids: IRIdAllocator;

  /**
   * Promoted declarations whose block params should be materialized.
   *
   * This should be the same declaration set passed to `BindingPromotionPass`.
   * Other block parameters, such as produced loop/catch values or expression
   * join values, are left in block-param form for existing structured codegen.
   */
  readonly declarations: readonly DeclarationId[];
}

/**
 * Creates the pass that converts promoted binding block params into copies.
 *
 * Binding promotion represents merge values with block parameters. JavaScript
 * has no block parameters, so this pass inserts explicit `CopyValueOp`s on
 * predecessor edges and removes the promoted declaration params from successor blocks.
 *
 * @example
 * ```txt
 * // Before
 * then:
 *   JumpTerminatorOp(join(v1))
 * else:
 *   JumpTerminatorOp(join(v2))
 * join(x):
 *   ReturnTerminatorOp(x)
 *
 * // After
 * then:
 *   CopyValueOp(x, v1)
 *   JumpTerminatorOp(join)
 * else:
 *   CopyValueOp(x, v2)
 *   JumpTerminatorOp(join)
 * join:
 *   ReturnTerminatorOp(x)
 * ```
 */
export function createSSAEliminationPass(
  options: SSAEliminationPassOptions,
): FunctionPass {
  return {
    name: "ssa-elimination",

    run(fn: FunctionIR, _analyses: AnalysisManager): PassResult {
      return new SSAElimination(fn, options).run();
    },
  };
}

interface EdgeRewrite {
  readonly target: BlockTarget;
  readonly copies: readonly ParallelCopy[];
}

/**
 * Lowers selected block parameters to explicit edge copies.
 *
 * Direct jump edges can receive copies in the predecessor blocks before the
 * terminator. Conditional or structured edges need an inserted edge-copy block
 * so copies execute only when that edge is taken.
 */
class SSAElimination {
  readonly #eliminatedDeclarations: ReadonlySet<DeclarationId>;
  #changed = false;

  constructor(
    private readonly fn: FunctionIR,
    private readonly options: SSAEliminationPassOptions,
  ) {
    this.#eliminatedDeclarations = new Set(options.declarations);
  }

  public run(): PassResult {
    if (this.#eliminatedDeclarations.size === 0) {
      return { changed: false };
    }

    for (const block of Array.from(this.fn.blocks)) {
      const terminator = block.terminator;
      if (terminator === null) continue;

      this.eliminateSuccessorEdges(block, terminator);
    }

    for (const block of this.fn.blocks) {
      this.removeEliminatedBlockParams(block);
    }

    return {
      changed: this.#changed,
      preserved: this.#changed ? PreservedAnalyses.none() : undefined,
    };
  }

  private eliminateSuccessorEdges(
    block: BasicBlock,
    terminator: TerminatorOp,
  ): void {
    let current: TerminatorOp = terminator;
    const successorIndices = [...terminator.successorIndices()];

    for (const index of successorIndices) {
      const target = current.target(index);
      const rewrite = this.planEdgeRewrite(target);

      if (rewrite.copies.length === 0 && rewrite.target === target) {
        continue;
      }

      if (this.canPlaceCopiesInPredecessor(current)) {
        this.insertCopiesBeforeTerminator(block, rewrite.copies);
        current = this.replaceTarget(block, current, index, rewrite.target);
        continue;
      }

      const edgeBlock = this.createEdgeCopyBlock(rewrite);
      current = this.replaceTarget(block, current, index, {
        block: edgeBlock,
        operands: { produced: target.operands.produced, forwarded: [] },
      });
    }
  }

  private canPlaceCopiesInPredecessor(terminator: TerminatorOp): boolean {
    return terminator.successorIndices().length === 1;
  }

  private replaceTarget(
    block: BasicBlock,
    terminator: TerminatorOp,
    index: number,
    target: BlockTarget,
  ): TerminatorOp {
    const replacement = terminator.withTarget(index, target);
    block.replaceOp(terminator, replacement);
    this.#changed = true;
    return replacement;
  }

  private planEdgeRewrite(target: BlockTarget): EdgeRewrite {
    const params = target.block.params;
    const produced = target.operands.produced;
    const forwarded = target.operands.forwarded;

    if (params.length !== produced.length + forwarded.length) {
      throw new Error(
        `Block bb${target.block.id} has ${params.length} params but edge passes ${produced.length + forwarded.length} values`,
      );
    }

    for (let i = 0; i < produced.length; i++) {
      const param = params[i];

      if (
        param.declarationId !== null &&
        this.#eliminatedDeclarations.has(param.declarationId)
      ) {
        throw new Error(
          `SSAEliminationPass cannot eliminate produced param value#${param.id} on edge to bb${target.block.id}`,
        );
      }
    }

    const copies: ParallelCopy[] = [];
    const retainedForwarded: Value[] = [];

    for (let i = 0; i < forwarded.length; i++) {
      const param = params[produced.length + i];
      const arg = forwarded[i];

      if (
        param.declarationId !== null &&
        this.#eliminatedDeclarations.has(param.declarationId)
      ) {
        copies.push({ target: param, source: arg });
        continue;
      }

      retainedForwarded.push(arg);
    }

    if (copies.length === 0) {
      return { target, copies };
    }

    return {
      copies,
      target: {
        block: target.block,
        operands: { produced, forwarded: retainedForwarded },
      },
    };
  }

  private insertCopiesBeforeTerminator(
    block: BasicBlock,
    copies: readonly ParallelCopy[],
  ): void {
    let index = block.operations.length - 1;

    for (const copy of scheduleParallelCopies(copies, this.options)) {
      block.insertOp(index, copy);
      index++;
    }
  }

  /**
   * Splits an edge so copies run only on that control-flow path.
   *
   * The new block contains the copies and then jumps to the original successor
   * with the retained edge arguments.
   */
  private createEdgeCopyBlock(rewrite: EdgeRewrite): BasicBlock {
    const edgeBlock = new BasicBlock(this.options.ids.blockId());
    const producedParams = rewrite.target.operands.produced.map(
      () => new Value(this.options.ids.valueId()),
    );

    edgeBlock.setParams(producedParams);
    this.fn.addBlock(edgeBlock);

    for (const copy of scheduleParallelCopies(rewrite.copies, this.options)) {
      edgeBlock.appendOp(copy);
    }

    edgeBlock.setTerminator(
      new JumpTerminatorOp(this.options.ids.operationId(), {
        block: rewrite.target.block,
        operands: {
          produced: [],
          forwarded: [...producedParams, ...rewrite.target.operands.forwarded],
        },
      }),
    );

    return edgeBlock;
  }

  private removeEliminatedBlockParams(block: BasicBlock): void {
    for (let index = block.params.length - 1; index >= 0; index--) {
      const param = block.params[index];

      if (
        param.declarationId !== null &&
        this.#eliminatedDeclarations.has(param.declarationId)
      ) {
        block.removeParam(index);
        this.#changed = true;
      }
    }
  }
}
