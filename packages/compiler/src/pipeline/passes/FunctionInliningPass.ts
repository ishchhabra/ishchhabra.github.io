import { ProjectUnit } from "../../frontend/ProjectBuilder";
import { BaseInstruction, BasicBlock, BlockId } from "../../ir";
import { FunctionIR, FunctionIRId } from "../../ir/core/FunctionIR";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { Place } from "../../ir/core/Place";
import { BranchTerminal, JumpTerminal } from "../../ir/core/Terminal";
import { TernaryStructure } from "../../ir/core/Structure";
import { makeInstructionId } from "../../ir/base/Instruction";
import { CallExpressionInstruction } from "../../ir/instructions/value/CallExpression";
import { AnalysisManager } from "../analysis/AnalysisManager";
import { CallGraphAnalysis, CallGraphResult } from "../analysis/CallGraphAnalysis";
import { BaseOptimizationPass } from "../late-optimizer/OptimizationPass";
import { Phi } from "../ssa/Phi";

/**
 * A pass that inlines calls to small or trivial functions directly into the
 * calling site, removing function-call overhead and enabling further optimizations
 * like constant propagation. For example:
 *
 * ```js
 * function foo(x) { return x + 1; }
 *
 * function bar() {
 *   const a = 5;
 *   return foo(a);
 * }
 * ```
 *
 * Will be transformed into:
 * ```js
 * function bar() {
 *   const a = 5;
 *   return a + 1;
 * }
 * ```
 */
export class FunctionInliningPass extends BaseOptimizationPass {
  constructor(
    protected readonly functionIR: FunctionIR,
    private readonly moduleIR: ModuleIR,
    private readonly AM: AnalysisManager,
    private readonly projectUnit: ProjectUnit,
  ) {
    super(functionIR);
  }

  private get phis(): Set<Phi> {
    return this.functionIR.phis;
  }

  public step() {
    const callGraph = this.AM.get(CallGraphAnalysis, this.projectUnit);
    let changed = false;

    for (const [blockId, block] of this.functionIR.blocks) {
      // If this block is a ternary arm that contains an inlinable call,
      // dissolve the ternary back into an if/else diamond first. This
      // lets us inline into a normal block; PhiOptimizationPass will
      // re-evaluate the diamond on the next fixpoint iteration and
      // collapse it back into a ternary if the arms remain expression-only.
      if (this.blockHasInlinableCall(callGraph, block)) {
        const owning = this.functionIR.findOwningTernary(blockId);
        if (owning) {
          this.dissolveTernary(owning.headerBlockId, owning.structure);
          changed = true;
        }
      }

      for (let index = 0; index < block.instructions.length; index++) {
        const instr = block.instructions[index];
        if (!(instr instanceof CallExpressionInstruction)) {
          continue;
        }

        const calleeIR = callGraph.resolveFunctionFromCallExpression(this.moduleIR, instr);
        if (calleeIR === undefined) {
          continue;
        }

        const { modulePath, functionIRId } = calleeIR;
        const moduleIR = this.projectUnit.modules.get(modulePath);
        if (!moduleIR) {
          continue;
        }

        const functionIR = moduleIR.functions.get(functionIRId);
        if (!functionIR) {
          continue;
        }

        if (!this.isInlinableFunction(callGraph, functionIR, modulePath)) {
          continue;
        }

        const prevLen = block.instructions.length;
        this.inlineFunctionIR(index, block, functionIR);
        changed = true;
        // Skip past the instructions that were spliced in.
        index += block.instructions.length - prevLen;
      }
    }

    return { changed };
  }

  /**
   * Returns true if the block contains at least one call expression that
   * would be inlinable, without actually performing the inline.
   */
  private blockHasInlinableCall(callGraph: CallGraphResult, block: BasicBlock): boolean {
    for (const instr of block.instructions) {
      if (!(instr instanceof CallExpressionInstruction)) continue;

      const calleeIR = callGraph.resolveFunctionFromCallExpression(this.moduleIR, instr);
      if (calleeIR === undefined) continue;

      const { modulePath, functionIRId } = calleeIR;
      const moduleIR = this.projectUnit.modules.get(modulePath);
      if (!moduleIR) continue;

      const functionIR = moduleIR.functions.get(functionIRId);
      if (!functionIR) continue;

      if (this.isInlinableFunction(callGraph, functionIR, modulePath)) return true;
    }
    return false;
  }

  /**
   * Dissolves a TernaryStructure back into a normal if/else diamond so
   * that its arm blocks can be inlined into. Creates a new Phi to merge
   * the arm values at the fallthrough block. PhiOptimizationPass will
   * re-evaluate the diamond on the next fixpoint iteration.
   */
  private dissolveTernary(headerBlockId: BlockId, structure: TernaryStructure): void {
    const environment = this.moduleIR.environment;

    // Remove the structure.
    this.functionIR.deleteStructure(headerBlockId);

    // Restore the header's BranchTerminal.
    const headerBlock = this.functionIR.blocks.get(headerBlockId)!;
    const terminalId = headerBlock.terminal
      ? headerBlock.terminal.id
      : makeInstructionId(environment.nextInstructionId++);
    headerBlock.replaceTerminal(
      new BranchTerminal(
        terminalId,
        structure.test,
        structure.consequent,
        structure.alternate,
        structure.fallthrough,
      ),
    );

    // Restore JumpTerminals on each arm.
    const consBlock = this.functionIR.blocks.get(structure.consequent)!;
    const altBlock = this.functionIR.blocks.get(structure.alternate)!;
    consBlock.replaceTerminal(
      new JumpTerminal(makeInstructionId(environment.nextInstructionId++), structure.fallthrough),
    );
    altBlock.replaceTerminal(
      new JumpTerminal(makeInstructionId(environment.nextInstructionId++), structure.fallthrough),
    );

    // Create a Phi that merges the arm values into resultPlace.
    // Register the declaration so SSAEliminator can find the dominator
    // block for the `let` declaration it emits.
    const declId = structure.resultPlace.identifier.declarationId;
    if (!environment.declToPlaces.has(declId)) {
      environment.registerDeclaration(declId, headerBlockId, structure.resultPlace.id);
    }

    const phi = new Phi(
      structure.fallthrough,
      structure.resultPlace,
      new Map<BlockId, Place>([
        [structure.consequent, structure.consequentValue],
        [structure.alternate, structure.alternateValue],
      ]),
      declId,
    );
    this.phis.add(phi);

    this.functionIR.recomputeCFG();
  }

  /**
   * Checks whether the function is inlinable:
   * - Must have exactly one block
   * - Must not be async or a generator (inlining would splice await/yield into the wrong context)
   * - Must not be recursive
   * - If cross-module, must be self-contained (no references to Places
   *   from the callee's module scope). Cross-module inlining with
   *   import forwarding is planned but not yet implemented.
   */
  private isInlinableFunction(
    callGraph: CallGraphResult,
    funcIR: FunctionIR,
    modulePath: string,
  ): boolean {
    if (funcIR.blocks.size > 1) {
      return false;
    }

    if (funcIR.async || funcIR.generator) {
      return false;
    }

    if (this.isFunctionRecursive(callGraph, funcIR, modulePath)) {
      return false;
    }

    if (modulePath !== this.moduleIR.path && funcIR.hasExternalReferences()) {
      return false;
    }

    return true;
  }

  /**
   * Checks if `funcIR` is part of a recursion cycle reachable through *either*
   * the call graph or lexically nested function expressions.
   *
   * Lexical nesting matters because cloning a function during inlining also
   * deep-clones every nested arrow / function expression / function
   * declaration in its body. If any of those nested closures eventually calls
   * back into `funcIR` — even via an opaque external like `Array.prototype.forEach`
   * — then inlining `funcIR` will produce a fresh clone whose nested closure
   * points back at `funcIR`, the optimizer will visit the new clone, inline
   * `funcIR` again, and the chain compounds until the next `FunctionIR.clone`
   * recursion overflows the JS call stack.
   *
   * Concrete trigger that surfaced this code path:
   *
   * ```js
   * // @radix-ui/react-toast: getAnnounceTextContent
   * function getAnnounceTextContent(node) {
   *   const out = [];
   *   Array.from(node.childNodes).forEach((child) => {
   *     // ...
   *     out.push(...getAnnounceTextContent(child));   // recurses through forEach
   *   });
   *   return out;
   * }
   * ```
   *
   * The outer function has *no* outgoing call-graph edges that resolve
   * (forEach is opaque), so a forward-only DFS over the call graph would
   * miss the cycle. We have to also walk every nested function expression
   * in the candidate's body.
   */
  private isFunctionRecursive(
    callGraph: CallGraphResult,
    funcIR: FunctionIR,
    modulePath: string,
  ): boolean {
    // FunctionIRId is per-module; call graph edges are cross-module.
    const frame = (mp: string, id: FunctionIRId) => `${mp}\0${String(id)}`;
    const targetKey = frame(modulePath, funcIR.id);
    const visited = new Set<string>();

    const dfs = (current: FunctionIR, currentModulePath: string): boolean => {
      const key = frame(currentModulePath, current.id);
      if (visited.has(key)) {
        return false;
      }
      visited.add(key);

      // Edge 1: direct call-graph callees of `current`.
      for (const neighbor of callGraph.getCallees(currentModulePath, current.id)) {
        const neighborKey = frame(neighbor.modulePath, neighbor.functionIRId);
        if (neighborKey === targetKey) {
          return true;
        }
        const neighborFn = this.projectUnit.modules
          .get(neighbor.modulePath)
          ?.functions.get(neighbor.functionIRId);
        if (neighborFn !== undefined && dfs(neighborFn, neighbor.modulePath)) {
          return true;
        }
      }

      // Edge 2: function expressions / declarations nested *lexically*
      // inside `current`. Cloning `current` clones these too, so any cycle
      // through their bodies is just as dangerous as a direct cycle.
      for (const instr of current.getNestedFunctionInstructions()) {
        if (instr.functionIR.id === funcIR.id && currentModulePath === modulePath) {
          return true;
        }
        if (dfs(instr.functionIR, currentModulePath)) {
          return true;
        }
      }

      return false;
    };

    return dfs(funcIR, modulePath);
  }

  /**
   * Finds the instruction (FunctionDeclaration, ArrowFunctionExpression,
   * or FunctionExpression) that declares the given FunctionIR, by
   * scanning all blocks in the module. Returns undefined if not found.
   */
  private findDeclaringInstruction(funcIR: FunctionIR): BaseInstruction | undefined {
    for (const fn of funcIR.moduleIR.functions.values()) {
      for (const block of fn.blocks.values()) {
        for (const instr of block.instructions) {
          if (
            "functionIR" in instr &&
            (instr as { functionIR: FunctionIR }).functionIR === funcIR
          ) {
            return instr;
          }
        }
      }
    }
    return undefined;
  }

  private inlineFunctionIR(index: number, callExpressionBlock: BasicBlock, funcIR: FunctionIR) {
    if (funcIR.blocks.size > 1) {
      throw new Error("Function has multiple blocks");
    }

    const callExpressionInstr = callExpressionBlock.instructions[index];
    if (!(callExpressionInstr instanceof CallExpressionInstruction)) {
      throw new Error("Expected CallExpressionInstruction");
    }

    // Resolve capture params to the actual outer places so the cloned
    // runtime fragment can reference captured variables directly.
    let captures: Place[] = [];
    const declInstr = this.findDeclaringInstruction(funcIR);
    if (declInstr) {
      captures = "captures" in declInstr ? (declInstr as { captures: Place[] }).captures : [];
    }
    const fragment = funcIR.cloneInlineFragment(this.moduleIR, callExpressionInstr.args, captures);
    this.functionIR.replaceInstructionWithInstructions(
      callExpressionBlock,
      index,
      fragment.instructions,
    );
    this.functionIR.replacePlaceUses(callExpressionInstr.place, fragment.returnPlace, {
      skipBlock: callExpressionBlock,
      skipInstructionIndex: index + fragment.instructions.length,
    });
  }
}
