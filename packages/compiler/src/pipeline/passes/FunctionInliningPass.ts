import { Environment } from "../../environment";
import { ProjectUnit } from "../../frontend/ProjectBuilder";
import {
  ArrayExpressionInstruction,
  ArrayPatternInstruction,
  BaseInstruction,
  BasicBlock,
  BlockId,
  IdentifierId,
  LiteralInstruction,
  RestElementInstruction,
  ReturnTerminal,
  StoreLocalInstruction,
} from "../../ir";
import { FunctionIR, FunctionIRId } from "../../ir/core/FunctionIR";
import { Identifier } from "../../ir/core/Identifier";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { Place } from "../../ir/core/Place";
import { BranchTerminal, JumpTerminal } from "../../ir/core/Terminal";
import { TernaryStructure } from "../../ir/core/Structure";
import { makeInstructionId } from "../../ir/base/Instruction";
import { AssignmentPatternInstruction } from "../../ir/instructions/pattern/AssignmentPattern";
import { ArrowFunctionExpressionInstruction } from "../../ir/instructions/value/ArrowFunctionExpression";
import { CallExpressionInstruction } from "../../ir/instructions/value/CallExpression";
import { FunctionExpressionInstruction } from "../../ir/instructions/value/FunctionExpression";
import { FunctionDeclarationInstruction } from "../../ir/instructions/declaration/FunctionDeclaration";
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
        const owning = this.findOwningTernary(blockId);
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
        this.inlineFunctionIR(index, block, functionIR, this.moduleIR.environment);
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
   * If `blockId` is a consequent or alternate arm of a TernaryStructure,
   * returns that structure and its header block ID. Otherwise returns null.
   */
  private findOwningTernary(
    blockId: BlockId,
  ): { headerBlockId: BlockId; structure: TernaryStructure } | null {
    for (const [headerBlockId, structure] of this.functionIR.structures) {
      if (
        structure instanceof TernaryStructure &&
        (structure.consequent === blockId || structure.alternate === blockId)
      ) {
        return { headerBlockId, structure };
      }
    }
    return null;
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

    if (modulePath !== this.moduleIR.path && this.hasExternalReferences(funcIR)) {
      return false;
    }

    return true;
  }

  /**
   * Returns true if the function reads from Places not defined within
   * its own header or blocks (i.e., it captures from its module scope).
   */
  private hasExternalReferences(funcIR: FunctionIR): boolean {
    const ownPlaceIds = new Set<IdentifierId>();

    for (const param of funcIR.params) {
      ownPlaceIds.add(param.identifier.id);
    }
    for (const bindings of funcIR.paramBindings) {
      for (const binding of bindings) {
        ownPlaceIds.add(binding.identifier.id);
      }
    }
    for (const captureParam of funcIR.captureParams) {
      ownPlaceIds.add(captureParam.identifier.id);
    }

    for (const instr of funcIR.header) {
      ownPlaceIds.add(instr.place.identifier.id);
    }
    for (const [, block] of funcIR.blocks) {
      for (const instr of block.instructions) {
        ownPlaceIds.add(instr.place.identifier.id);
      }
    }

    for (const instr of funcIR.header) {
      for (const place of instr.getOperands()) {
        if (!ownPlaceIds.has(place.identifier.id)) {
          return true;
        }
      }
    }
    for (const [, block] of funcIR.blocks) {
      for (const instr of block.instructions) {
        for (const place of instr.getOperands()) {
          if (!ownPlaceIds.has(place.identifier.id)) {
            return true;
          }
        }
      }

      const terminal = block.terminal;
      if (terminal) {
        for (const place of terminal.getOperands()) {
          if (!ownPlaceIds.has(place.identifier.id)) {
            return true;
          }
        }
      }
    }
    return false;
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
      for (const instr of nestedFunctionInstructions(current)) {
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
    for (const fn of this.moduleIR.functions.values()) {
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

  private inlineFunctionIR(
    index: number,
    callExpressionBlock: BasicBlock,
    funcIR: FunctionIR,
    environment: Environment,
  ) {
    if (funcIR.blocks.size > 1) {
      throw new Error("Function has multiple blocks");
    }

    const callExpressionInstr = callExpressionBlock.instructions[index];
    if (!(callExpressionInstr instanceof CallExpressionInstruction)) {
      throw new Error("Expected CallExpressionInstruction");
    }

    const rewriteMap = new Map<Identifier, Place>();

    // Resolve capture params to the actual outer places so inlined
    // instructions can reference captured variables directly.
    // The declaring instruction's captures[i] corresponds to funcIR.captureParams[i].
    const declInstr = this.findDeclaringInstruction(funcIR);
    if (declInstr) {
      const captures = "captures" in declInstr ? (declInstr as { captures: Place[] }).captures : [];
      for (let i = 0; i < funcIR.captureParams.length; i++) {
        if (i < captures.length) {
          rewriteMap.set(funcIR.captureParams[i].identifier, captures[i]);
        }
      }
    }

    const instrs: BaseInstruction[] = [];
    this.inlineFunctionParams(funcIR, callExpressionInstr, this.moduleIR, instrs, rewriteMap);

    const block = funcIR.blocks.values().next().value!;
    for (const instr of block.instructions) {
      // instr.clone(this.moduleIR) recursively deep-clones any nested
      // FunctionIR into the caller's module — function-owning instruction
      // clones (Arrow/Function expression, FunctionDeclaration) call
      // `this.functionIR.clone(moduleIR)` internally.
      const clonedInstr = instr.clone(this.moduleIR);
      rewriteMap.set(instr.place.identifier, clonedInstr.place);
      instrs.push(clonedInstr.rewrite(rewriteMap, { rewriteDefinitions: true }));
    }

    if (block.terminal instanceof ReturnTerminal) {
      const rewritten = callExpressionInstr.rewrite(rewriteMap);
      callExpressionBlock.replaceInstruction(index, rewritten);
      environment.placeToInstruction.set(rewritten.place.id, rewritten);
    }

    let returnPlace: Place;
    if (block.terminal instanceof ReturnTerminal && block.terminal.value !== null) {
      const oldReturnId = block.terminal.value.identifier;
      const rewritten = rewriteMap.get(oldReturnId);

      if (!rewritten) {
        throw new Error("Could not find a rewritten place for the function's return value");
      }
      returnPlace = rewritten;
    } else {
      // Void function: the call evaluates to undefined. Create an undefined
      // literal so any reference to the call's result place resolves correctly.
      const undefinedLiteral = environment.createInstruction(
        LiteralInstruction,
        environment.createPlace(environment.createIdentifier()),
        undefined,
      );
      instrs.push(undefinedLiteral);
      returnPlace = undefinedLiteral.place;
    }

    // Splice out the call and insert inlined instructions.
    const removed = callExpressionBlock.instructions[index];
    // Unregister the removed call instruction's uses and definers.
    for (const place of removed.getOperands()) {
      place.identifier.uses.delete(removed);
    }
    for (const place of removed.getDefs()) {
      if (place.identifier.definer === removed) place.identifier.definer = undefined;
    }
    callExpressionBlock.instructions.splice(index, 1, ...instrs);
    // Register inlined instructions' uses, definers, and placeToInstruction entries.
    for (const instr of instrs) {
      for (const place of instr.getOperands()) {
        place.identifier.uses.add(instr);
      }
      for (const place of instr.getDefs()) {
        place.identifier.definer = instr;
      }
      environment.placeToInstruction.set(instr.place.id, instr);
    }

    const retRewriteMap = new Map<Identifier, Place>();
    retRewriteMap.set(callExpressionInstr.place.identifier, returnPlace);

    // Rewrite all references to the old call result across the entire
    // function — not just the inlined block, but also other blocks
    // (e.g. a ternary's fallthrough) that may reference the call result.
    for (const [, rewriteBlock] of this.functionIR.blocks) {
      if (rewriteBlock === callExpressionBlock) {
        // Skip the just-inlined instructions; only rewrite from after them.
        for (let i = index + instrs.length; i < rewriteBlock.instructions.length; i++) {
          const rewrittenInstr = rewriteBlock.instructions[i].rewrite(retRewriteMap);
          if (rewrittenInstr !== rewriteBlock.instructions[i]) {
            rewriteBlock.replaceInstruction(i, rewrittenInstr);
            environment.placeToInstruction.set(rewrittenInstr.place.id, rewrittenInstr);
          }
        }
        if (rewriteBlock.terminal) {
          rewriteBlock.replaceTerminal(rewriteBlock.terminal.rewrite(retRewriteMap));
        }
      } else {
        rewriteBlock.rewriteAll(retRewriteMap);
      }
    }

    // Update any structures that reference the old call result place
    // (e.g. a TernaryStructure whose test was the inlined call's result).
    for (const [blockId, structure] of this.functionIR.structures) {
      const rewritten = structure.rewrite(retRewriteMap);
      if (rewritten !== structure) {
        this.functionIR.setStructure(blockId, rewritten);
      }
    }

    // Update any phi operands that reference the old call result place.
    for (const phi of this.phis) {
      for (const [phiBlockId, operandPlace] of phi.operands) {
        if (operandPlace.identifier === callExpressionInstr.place.identifier) {
          phi.operands.set(phiBlockId, returnPlace);
        }
      }
    }
  }

  /**
   * Returns true when every param can be directly assigned to its
   * corresponding call-site arg via a simple `const param = arg`.
   * This is the case for plain identifiers and destructuring patterns
   * (object/array), but NOT for default params (AssignmentPattern) or
   * rest params (RestElement) which need the array-pattern wrapper.
   */
  private canDirectWireParams(funcIR: FunctionIR): boolean {
    // Build a set of identifiers that are param roots for O(1) lookup.
    const paramIds = new Set(funcIR.params.map((p) => p.identifier.id));

    for (const instr of funcIR.header) {
      if (!paramIds.has(instr.place.identifier.id)) continue;
      if (instr instanceof AssignmentPatternInstruction) return false;
      if (instr instanceof RestElementInstruction) return false;
    }
    return true;
  }

  private inlineFunctionParams(
    funcIR: FunctionIR,
    callExpressionInstr: CallExpressionInstruction,
    moduleIR: ModuleIR,
    instrs: BaseInstruction[],
    rewriteMap: Map<Identifier, Place>,
  ) {
    const environment = moduleIR.environment;

    const ensureClonedPlace = (place: Place) => {
      if (rewriteMap.has(place.identifier)) {
        return;
      }
      const identifier = environment.createIdentifier(place.identifier.declarationId);
      rewriteMap.set(place.identifier, environment.createPlace(identifier));
    };

    for (const paramPlace of funcIR.params) {
      ensureClonedPlace(paramPlace);
    }
    for (const bindings of funcIR.paramBindings) {
      for (const binding of bindings) {
        ensureClonedPlace(binding);
      }
    }

    for (const instr of funcIR.header) {
      const clonedInstr = instr.clone(moduleIR);
      rewriteMap.set(instr.place.identifier, clonedInstr.place);
      instrs.push(clonedInstr.rewrite(rewriteMap));
    }

    // Per-param direct wiring: when every param's root instruction is NOT
    // an AssignmentPattern (default) or RestElement (rest), we can emit
    // a direct StoreLocal per param instead of wrapping everything in
    // const [params] = [args]. This handles simple identifiers, object
    // destructuring, and array destructuring params.
    if (this.canDirectWireParams(funcIR)) {
      for (let i = 0; i < funcIR.params.length; i++) {
        const paramPlace = funcIR.params[i];
        const elementPlace = rewriteMap.get(paramPlace.identifier)!;
        rewriteMap.set(paramPlace.identifier, elementPlace);

        // When the caller passes fewer args than the function declares,
        // the missing param is undefined (standard JS semantics).
        let argPlace = callExpressionInstr.args[i];
        if (argPlace === undefined) {
          const undefinedLiteral = environment.createInstruction(
            LiteralInstruction,
            environment.createPlace(environment.createIdentifier()),
            undefined,
          );
          instrs.push(undefinedLiteral);
          argPlace = undefinedLiteral.place;
        }

        const bindings = funcIR.paramBindings[i].map((p) => rewriteMap.get(p.identifier) ?? p);

        const storeLocalPlace = environment.createPlace(environment.createIdentifier());
        instrs.push(
          environment.createInstruction(
            StoreLocalInstruction,
            storeLocalPlace,
            elementPlace,
            argPlace,
            "const",
            "declaration",
            bindings,
          ),
        );
      }
      return;
    }

    // Fallback: default or rest params require array pattern to preserve
    // full JS parameter semantics.
    const leftElements = [];
    for (let i = 0; i < funcIR.params.length; i++) {
      const paramPlace = funcIR.params[i];
      const elementPlace = rewriteMap.get(paramPlace.identifier)!;
      leftElements.push(elementPlace);
      rewriteMap.set(paramPlace.identifier, elementPlace);
    }

    const leftArrayPatternIdentifier = environment.createIdentifier();
    const leftArrayPatternPlace = environment.createPlace(leftArrayPatternIdentifier);
    const leftArrayPattern = environment.createInstruction(
      ArrayPatternInstruction,
      leftArrayPatternPlace,
      leftElements,
      funcIR.params.flatMap((paramPlace, i) => {
        const leaves = funcIR.paramBindings[i];
        if (leaves.length > 0) {
          return leaves.map((p) => rewriteMap.get(p.identifier) ?? p);
        }
        return [rewriteMap.get(paramPlace.identifier)!];
      }),
    );

    const rightElements = [];
    for (let i = 0; i < callExpressionInstr.args.length; i++) {
      const argPlace = callExpressionInstr.args[i];
      rightElements.push(argPlace);
    }

    const rightArrayPatternIdentifier = environment.createIdentifier();
    const rightArrayPatternPlace = environment.createPlace(rightArrayPatternIdentifier);
    const rightArrayPattern = environment.createInstruction(
      ArrayExpressionInstruction,
      rightArrayPatternPlace,
      rightElements,
    );

    const storeLocalIdentifier = environment.createIdentifier();
    const storeLocalPlace = environment.createPlace(storeLocalIdentifier);
    const storeLocalInstr = environment.createInstruction(
      StoreLocalInstruction,
      storeLocalPlace,
      leftArrayPatternPlace,
      rightArrayPatternPlace,
      "const",
      "declaration",
      leftArrayPattern.bindings,
    );

    instrs.push(leftArrayPattern, rightArrayPattern, storeLocalInstr);
  }
}

/**
 * Yields every instruction in `funcIR` (header + every block) that owns a
 * nested FunctionIR — arrows, function expressions, and function
 * declarations. Used by `isFunctionRecursive` to follow lexical nesting when
 * looking for cycles.
 */
type NestedFunctionInstruction =
  | ArrowFunctionExpressionInstruction
  | FunctionExpressionInstruction
  | FunctionDeclarationInstruction;

function isNestedFunctionInstruction(
  instr: BaseInstruction,
): instr is NestedFunctionInstruction {
  return (
    instr instanceof ArrowFunctionExpressionInstruction ||
    instr instanceof FunctionExpressionInstruction ||
    instr instanceof FunctionDeclarationInstruction
  );
}

function* nestedFunctionInstructions(
  funcIR: FunctionIR,
): IterableIterator<NestedFunctionInstruction> {
  for (const instr of funcIR.header) {
    if (isNestedFunctionInstruction(instr)) {
      yield instr;
    }
  }
  for (const block of funcIR.blocks.values()) {
    for (const instr of block.instructions) {
      if (isNestedFunctionInstruction(instr)) {
        yield instr;
      }
    }
  }
}
