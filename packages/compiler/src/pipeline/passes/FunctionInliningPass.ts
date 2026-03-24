import { Environment } from "../../environment";
import { ProjectUnit } from "../../frontend/ProjectBuilder";
import {
  ArrayExpressionInstruction,
  ArrayPatternInstruction,
  BaseInstruction,
  BasicBlock,
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
import { AssignmentPatternInstruction } from "../../ir/instructions/pattern/AssignmentPattern";
import { CallExpressionInstruction } from "../../ir/instructions/value/CallExpression";
import { CallGraph } from "../analysis/CallGraph";
import { BaseOptimizationPass } from "../late-optimizer/OptimizationPass";

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
    private readonly callGraph: CallGraph,
    private readonly projectUnit: ProjectUnit,
  ) {
    super(functionIR);
  }

  public step() {
    let changed = false;

    for (const [, block] of this.functionIR.blocks) {
      for (let index = 0; index < block.instructions.length; index++) {
        const instr = block.instructions[index];
        if (!(instr instanceof CallExpressionInstruction)) {
          continue;
        }

        const calleeIR = this.callGraph.resolveFunctionFromCallExpression(this.moduleIR, instr);
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

        if (!this.isInlinableFunction(functionIR, modulePath)) {
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
   * Checks whether the function is inlinable:
   * - Must have exactly one block
   * - Must not be async or a generator (inlining would splice await/yield into the wrong context)
   * - Must not be recursive
   * - If cross-module, must be self-contained (no references to Places
   *   from the callee's module scope). Cross-module inlining with
   *   import forwarding is planned but not yet implemented.
   */
  private isInlinableFunction(funcIR: FunctionIR, modulePath: string): boolean {
    if (funcIR.blocks.size > 1) {
      return false;
    }

    if (funcIR.async || funcIR.generator) {
      return false;
    }

    if (this.isFunctionRecursive(funcIR, modulePath)) {
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
    for (const instr of funcIR.header) {
      ownPlaceIds.add(instr.place.identifier.id);
    }
    for (const [, block] of funcIR.blocks) {
      for (const instr of block.instructions) {
        ownPlaceIds.add(instr.place.identifier.id);
      }
    }
    for (const [, block] of funcIR.blocks) {
      for (const instr of block.instructions) {
        for (const place of instr.getReadPlaces()) {
          if (!ownPlaceIds.has(place.identifier.id)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Checks if `funcIR` is part of a recursion cycle (direct or indirect).
   * We do a depth-first search on the call graph from `funcIR.id`,
   * returning `true` if we revisit the start function via any call chain.
   *
   * @param funcIR - The FunctionIR we want to test for recursion
   */
  private isFunctionRecursive(funcIR: FunctionIR, modulePath: string): boolean {
    const start = funcIR.id;
    const visited = new Set<FunctionIRId>();
    const stack = new Set<FunctionIRId>();

    const dfs = (current: FunctionIRId): boolean => {
      // If 'current' is already on the call stack, we've found a cycle
      if (stack.has(current)) {
        return true;
      }
      // If 'current' was fully visited before, no cycle found from this node
      if (visited.has(current)) {
        return false;
      }

      visited.add(current);
      stack.add(current);

      const neighbors = this.callGraph.calls.get(modulePath)?.get(current) ?? new Set();
      for (const neighbor of neighbors) {
        if (dfs(neighbor.functionIRId)) {
          return true;
        }
      }

      // Done exploring this path
      stack.delete(current);
      return false;
    };

    // Start DFS from the function's ID
    return dfs(start);
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
    this.inlineFunctionParams(funcIR, callExpressionInstr, environment, instrs, rewriteMap);

    const block = funcIR.blocks.values().next().value!;
    for (const instr of block.instructions) {
      const clonedInstr = instr.clone(environment);
      rewriteMap.set(instr.place.identifier, clonedInstr.place);
      instrs.push(clonedInstr.rewrite(rewriteMap, { rewriteDefinitions: true }));
    }

    if (block.terminal instanceof ReturnTerminal) {
      const rewritten = callExpressionInstr.rewrite(rewriteMap);
      callExpressionBlock.instructions[index] = rewritten;
      environment.placeToInstruction.set(rewritten.place.id, rewritten);
    }

    let returnPlace: Place;
    if (block.terminal instanceof ReturnTerminal) {
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
        undefined,
      );
      instrs.push(undefinedLiteral);
      returnPlace = undefinedLiteral.place;
    }

    callExpressionBlock.instructions.splice(index, 1, ...instrs);

    // Register inlined instructions in placeToInstruction so downstream
    // passes (e.g. DCE) can resolve expression definitions.
    for (const instr of instrs) {
      environment.placeToInstruction.set(instr.place.id, instr);
    }

    const retRewriteMap = new Map<Identifier, Place>();
    retRewriteMap.set(callExpressionInstr.place.identifier, returnPlace);

    for (let i = index + instrs.length; i < callExpressionBlock.instructions.length; i++) {
      const oldInstr = callExpressionBlock.instructions[i];
      const rewrittenInstr = oldInstr.rewrite(retRewriteMap);
      callExpressionBlock.instructions[i] = rewrittenInstr;
      environment.placeToInstruction.set(rewrittenInstr.place.id, rewrittenInstr);
    }

    // Also update the block's terminal if it references the old call place
    if (
      callExpressionBlock.terminal instanceof ReturnTerminal &&
      callExpressionBlock.terminal.value.identifier === callExpressionInstr.place.identifier
    ) {
      callExpressionBlock.terminal = new ReturnTerminal(
        callExpressionBlock.terminal.id,
        returnPlace,
      );
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
    environment: Environment,
    instrs: BaseInstruction[],
    rewriteMap: Map<Identifier, Place>,
  ) {
    for (const instr of funcIR.header) {
      const clonedInstr = instr.clone(environment);
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
            undefined,
          );
          instrs.push(undefinedLiteral);
          argPlace = undefinedLiteral.place;
        }

        const bindings = funcIR.paramBindings[i].map(
          (p) => rewriteMap.get(p.identifier) ?? p,
        );

        const storeLocalPlace = environment.createPlace(environment.createIdentifier());
        instrs.push(
          environment.createInstruction(
            StoreLocalInstruction,
            storeLocalPlace,
            undefined,
            elementPlace,
            argPlace,
            "const",
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
      undefined,
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
      undefined,
      rightElements,
    );

    const storeLocalIdentifier = environment.createIdentifier();
    const storeLocalPlace = environment.createPlace(storeLocalIdentifier);
    const storeLocalInstr = environment.createInstruction(
      StoreLocalInstruction,
      storeLocalPlace,
      undefined,
      leftArrayPatternPlace,
      rightArrayPatternPlace,
      "const",
      leftArrayPattern.bindings,
    );

    instrs.push(leftArrayPattern, rightArrayPattern, storeLocalInstr);
  }
}
