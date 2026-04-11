import { ProjectUnit } from "../../frontend/ProjectBuilder";
import {
  ArrayDestructureInstruction,
  ArrayExpressionInstruction,
  BaseInstruction,
  BasicBlock,
  BlockId,
  LiteralInstruction,
} from "../../ir";
import { FunctionIR, FunctionIRId } from "../../ir/core/FunctionIR";
import { Identifier } from "../../ir/core/Identifier";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { Place } from "../../ir/core/Place";
import { BranchTerminal, JumpTerminal, ReturnTerminal } from "../../ir/core/Terminal";
import { TernaryStructure } from "../../ir/core/Structure";
import { makeInstructionId } from "../../ir/base/Instruction";
import { CallExpressionInstruction } from "../../ir/instructions/value/CallExpression";
import { AnalysisManager } from "../analysis/AnalysisManager";
import { CallGraphAnalysis, CallGraphResult } from "../analysis/CallGraphAnalysis";
import { BaseOptimizationPass } from "../late-optimizer/OptimizationPass";
import { Phi } from "../ssa/Phi";

/**
 * Inlines calls to small, single-block functions directly into the
 * calling site. For example:
 *
 *   function foo(x) { return x + 1; }
 *   function bar() { return foo(5); }
 *
 * becomes:
 *
 *   function bar() { return 5 + 1; }
 *
 * The pass composes entirely from generic IR primitives: clone, rewrite,
 * and getDefs on instructions. No inlining-specific methods on FunctionIR.
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

  private get environment() {
    return this.moduleIR.environment;
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
        this.inlineCall(block, index, instr, functionIR);
        changed = true;
        // Skip past the instructions that were spliced in.
        index += block.instructions.length - prevLen;
      }
    }

    return { changed };
  }

  // -------------------------------------------------------------------
  // Inlining core
  // -------------------------------------------------------------------

  /**
   * Inlines a single call expression by:
   * 1. Building a substitution map (params → args, captures → outer places)
   * 2. Cloning the callee's prologue + body with that map
   * 3. Extracting the return place
   * 4. Splicing into the caller and rewriting uses of the call result
   */
  private inlineCall(
    block: BasicBlock,
    index: number,
    callInstr: CallExpressionInstruction,
    callee: FunctionIR,
  ): void {
    const substitutions = new Map<Identifier, Place>();

    // Bind captures.
    const captures = this.resolveCaptures(callee);
    for (let i = 0; i < callee.runtime.captureParams.length; i++) {
      if (i < captures.length) {
        substitutions.set(callee.runtime.captureParams[i].identifier, captures[i]);
      }
    }

    // Bind parameters and clone body.
    const bindings = this.bindParameters(callee, callInstr.args, substitutions);
    const prologue = this.cloneInstructions(this.getPrologueInstructions(callee), substitutions);
    const syntheticDestructure = this.buildSyntheticParamDestructure(callee, callInstr.args, substitutions);
    const body = this.cloneInstructions(callee.entryBlock.instructions, substitutions);
    const { place: returnPlace, instructions: returnInstructions } =
      this.extractReturnPlace(callee.entryBlock, substitutions);

    // Splice into the caller block.
    const instructions = [...bindings, ...prologue, ...syntheticDestructure, ...body, ...returnInstructions];
    this.spliceInstruction(block, index, instructions);

    // Rewrite all uses of the call result to the inlined return value.
    this.functionIR.rewrite(new Map([[callInstr.place.identifier, returnPlace]]), {
      skipBlock: block,
      skipInstructionIndex: index + instructions.length,
    });
  }

  /**
   * Binds callee parameters to argument places via direct substitution.
   * Missing arguments get an `undefined` literal.
   *
   * Multi-use parameters are handled by ValueMaterializationPass
   * after all optimizations complete — no need to create temporaries here.
   *
   * Only applies to functions without synthetic parameter destructuring
   * (default values, rest elements), which are handled separately.
   */
  private bindParameters(
    callee: FunctionIR,
    args: Place[],
    substitutions: Map<Identifier, Place>,
  ): BaseInstruction[] {
    if (this.hasSyntheticParamDestructure(callee)) {
      return [];
    }

    const bindings: BaseInstruction[] = [];

    callee.runtime.params.forEach((paramPlace, paramIndex) => {
      const argPlace = args[paramIndex];

      if (argPlace !== undefined) {
        substitutions.set(paramPlace.identifier, argPlace);
        return;
      }

      // Missing argument → undefined.
      const literal = this.environment.createInstruction(
        LiteralInstruction,
        this.environment.createPlace(this.environment.createIdentifier()),
        undefined,
      );
      bindings.push(literal);
      substitutions.set(paramPlace.identifier, literal.place);
    });

    return bindings;
  }

  /**
   * Returns the prologue instructions to clone, excluding any trailing
   * synthetic param destructure (which is rebuilt separately).
   */
  private getPrologueInstructions(callee: FunctionIR): BaseInstruction[] {
    if (this.hasSyntheticParamDestructure(callee)) {
      return callee.runtime.prologue.slice(0, -2);
    }
    return callee.runtime.prologue;
  }

  /**
   * For functions with synthetic parameter destructuring (default values,
   * rest elements), builds fresh ArrayExpression + ArrayDestructure
   * instructions that bind the call arguments.
   */
  private buildSyntheticParamDestructure(
    callee: FunctionIR,
    args: Place[],
    substitutions: Map<Identifier, Place>,
  ): BaseInstruction[] {
    if (!this.hasSyntheticParamDestructure(callee)) {
      return [];
    }

    const arrayExpr = this.environment.createInstruction(
      ArrayExpressionInstruction,
      this.environment.createPlace(this.environment.createIdentifier()),
      args,
    );
    const destructure = this.environment.createInstruction(
      ArrayDestructureInstruction,
      this.environment.createPlace(this.environment.createIdentifier()),
      callee.runtime.paramTargets,
      arrayExpr.place,
      "declaration",
      "const",
      true,
    );

    substitutions.set(arrayExpr.place.identifier, arrayExpr.place);
    substitutions.set(destructure.place.identifier, destructure.place);
    for (const def of destructure.getDefs()) {
      if (def.identifier !== destructure.place.identifier && !substitutions.has(def.identifier)) {
        substitutions.set(
          def.identifier,
          this.environment.createPlace(this.environment.createIdentifier()),
        );
      }
    }

    return [arrayExpr, destructure.rewrite(substitutions, { rewriteDefinitions: true })];
  }

  /**
   * Detects the synthetic parameter destructure pattern: the last two
   * prologue instructions are ArrayExpression + ArrayDestructure where
   * the destructure reads from the array expression.
   */
  private hasSyntheticParamDestructure(callee: FunctionIR): boolean {
    const prologue = callee.runtime.prologue;
    if (prologue.length < 2) {
      return false;
    }
    const maybeArrayExpr = prologue[prologue.length - 2];
    const maybeDestructure = prologue[prologue.length - 1];
    return (
      maybeArrayExpr instanceof ArrayExpressionInstruction &&
      maybeDestructure instanceof ArrayDestructureInstruction &&
      maybeDestructure.value.identifier === maybeArrayExpr.place.identifier
    );
  }

  // -------------------------------------------------------------------
  // Generic IR operations
  // -------------------------------------------------------------------

  /**
   * Clones an instruction list into the current module, accumulating
   * a substitution map. Each cloned instruction gets fresh identifiers;
   * the map is updated so subsequent instructions see earlier rewrites.
   */
  private cloneInstructions(
    instructions: BaseInstruction[],
    substitutions: Map<Identifier, Place>,
  ): BaseInstruction[] {
    const result: BaseInstruction[] = [];
    for (const instr of instructions) {
      const cloned = instr.clone(this.moduleIR);
      substitutions.set(instr.place.identifier, cloned.place);
      for (const def of instr.getDefs()) {
        if (def.identifier !== instr.place.identifier && !substitutions.has(def.identifier)) {
          substitutions.set(
            def.identifier,
            this.environment.createPlace(this.environment.createIdentifier()),
          );
        }
      }
      result.push(cloned.rewrite(substitutions, { rewriteDefinitions: true }));
    }
    return result;
  }

  /**
   * Extracts the return value from the callee's single block. If the
   * block ends with `return expr`, looks up the rewritten place.
   * Otherwise, creates an `undefined` literal (returned as an extra
   * instruction to splice in).
   */
  private extractReturnPlace(
    block: BasicBlock,
    substitutions: Map<Identifier, Place>,
  ): { place: Place; instructions: BaseInstruction[] } {
    if (block.terminal instanceof ReturnTerminal && block.terminal.value !== null) {
      const returnPlace = substitutions.get(block.terminal.value.identifier);
      if (!returnPlace) {
        throw new Error("Could not find a rewritten place for the function's return value");
      }
      return { place: returnPlace, instructions: [] };
    }

    const literal = this.environment.createInstruction(
      LiteralInstruction,
      this.environment.createPlace(this.environment.createIdentifier()),
      undefined,
    );
    return { place: literal.place, instructions: [literal] };
  }

  /**
   * Replaces the instruction at `index` with `replacements`, maintaining
   * definer pointers and the placeToInstruction index.
   */
  private spliceInstruction(
    block: BasicBlock,
    index: number,
    replacements: BaseInstruction[],
  ): void {
    const removed = block.instructions[index];
    for (const place of removed.getDefs()) {
      if (place.identifier.definer === removed) {
        place.identifier.definer = undefined;
      }
      if (this.environment.placeToInstruction.get(place.id) === removed) {
        this.environment.placeToInstruction.delete(place.id);
      }
    }
    block.removeInstructionAt(index);
    for (let i = 0; i < replacements.length; i++) {
      block.insertInstructionAt(index + i, replacements[i]);
      this.environment.placeToInstruction.set(replacements[i].place.id, replacements[i]);
    }
  }

  /**
   * Resolves capture parameters to the actual outer places from the
   * instruction that declares the callee function.
   */
  private resolveCaptures(callee: FunctionIR): Place[] {
    const declInstr = this.findDeclaringInstruction(callee);
    if (!declInstr) {
      return [];
    }
    return "captures" in declInstr ? (declInstr as { captures: Place[] }).captures : [];
  }

  // -------------------------------------------------------------------
  // Inlinability checks
  // -------------------------------------------------------------------

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
    // Remove the structure.
    this.functionIR.deleteStructure(headerBlockId);

    // Restore the header's BranchTerminal.
    const headerBlock = this.functionIR.blocks.get(headerBlockId)!;
    const terminalId = headerBlock.terminal
      ? headerBlock.terminal.id
      : makeInstructionId(this.environment.nextInstructionId++);
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
      new JumpTerminal(makeInstructionId(this.environment.nextInstructionId++), structure.fallthrough),
    );
    altBlock.replaceTerminal(
      new JumpTerminal(makeInstructionId(this.environment.nextInstructionId++), structure.fallthrough),
    );

    // Create a Phi that merges the arm values into resultPlace.
    const declId = structure.resultPlace.identifier.declarationId;
    if (!this.environment.declToPlaces.has(declId)) {
      this.environment.registerDeclaration(declId, headerBlockId, structure.resultPlace.id);
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
   * - Must not be async or a generator
   * - Must not be recursive
   * - If cross-module, must be self-contained
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
   * Checks if `funcIR` is part of a recursion cycle reachable through
   * either the call graph or lexically nested function expressions.
   */
  private isFunctionRecursive(
    callGraph: CallGraphResult,
    funcIR: FunctionIR,
    modulePath: string,
  ): boolean {
    const frame = (mp: string, id: FunctionIRId) => `${mp}\0${String(id)}`;
    const targetKey = frame(modulePath, funcIR.id);
    const visited = new Set<string>();

    const dfs = (current: FunctionIR, currentModulePath: string): boolean => {
      const key = frame(currentModulePath, current.id);
      if (visited.has(key)) {
        return false;
      }
      visited.add(key);

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
   * Finds the instruction that declares the given FunctionIR by
   * scanning all blocks in the module.
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
}
