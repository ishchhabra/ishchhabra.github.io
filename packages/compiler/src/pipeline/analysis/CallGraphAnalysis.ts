import { ProjectUnit } from "../../frontend/ProjectBuilder";
import {
  CallExpressionInstruction,
  DeclarationId,
  FunctionDeclarationInstruction,
  LoadGlobalInstruction,
  LoadLocalInstruction,
  StoreLocalInstruction,
} from "../../ir";
import { ArrowFunctionExpressionInstruction } from "../../ir/instructions/value/ArrowFunctionExpression";
import { FunctionExpressionInstruction } from "../../ir/instructions/value/FunctionExpression";
import { FunctionIRId } from "../../ir/core/FunctionIR";
import { ModuleGlobal, ModuleIR } from "../../ir/core/ModuleIR";
import { ExportFromInstruction } from "../../ir/instructions/module/ExportFrom";
import { AnalysisManager, ProjectAnalysis } from "./AnalysisManager";

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/** A resolved call target: module path + function ID within that module. */
export interface CallTarget {
  readonly modulePath: string;
  readonly functionIRId: FunctionIRId;
}

/**
 * Immutable result of call-graph analysis.
 *
 * Holds forward edges (caller → callees) and a declaration map
 * (DeclarationId → FunctionIRId) that enables call resolution.
 *
 * Query methods:
 * - {@link getCallees} — forward lookup
 * - {@link resolveFunctionFromCallExpression} — resolve a CallExpressionInstruction
 * - {@link resolveGlobalFunctionCall} — resolve a cross-module import call
 */
export class CallGraphResult {
  constructor(
    /** Forward edges: modulePath → (functionId → set of callees). */
    private readonly calls: Map<string, Map<FunctionIRId, Set<CallTarget>>>,
    /** Declaration lookup: modulePath → (declarationId → functionId). */
    private readonly declarations: Map<string, Map<DeclarationId, FunctionIRId>>,
    private readonly projectUnit: ProjectUnit,
  ) {}

  /** Forward lookup: which functions does (modulePath, functionId) call? */
  getCallees(modulePath: string, functionId: FunctionIRId): Set<CallTarget> {
    return this.calls.get(modulePath)?.get(functionId) ?? new Set();
  }

  /**
   * Resolves the callee of a {@link CallExpressionInstruction}.
   *
   * Handles two cases:
   * 1. **LoadGlobal** — cross-module import; delegates to {@link resolveGlobalFunctionCall}.
   * 2. **LoadLocal** — same-module reference to a declared function.
   *
   * Returns `undefined` when the callee cannot be statically resolved
   * (e.g. opaque external, computed property, higher-order argument).
   */
  resolveFunctionFromCallExpression(
    moduleIR: ModuleIR,
    callExpression: CallExpressionInstruction,
  ): CallTarget | undefined {
    const loadInstr = moduleIR.environment.placeToInstruction.get(callExpression.callee.id);

    if (loadInstr instanceof LoadGlobalInstruction) {
      const global = moduleIR.globals.get(loadInstr.name);
      return global !== undefined ? this.resolveGlobalFunctionCall(global) : undefined;
    }

    if (loadInstr instanceof LoadLocalInstruction) {
      const declarationId = loadInstr.value.identifier.declarationId;
      const funcIRId = this.declarations.get(moduleIR.path)?.get(declarationId);
      if (funcIRId !== undefined) {
        return { modulePath: moduleIR.path, functionIRId: funcIRId };
      }
    }

    return undefined;
  }

  /**
   * Follows a cross-module import chain until we reach the defining
   * function declaration / expression / arrow.
   *
   * Iterative to avoid stack overflow on deep `export { x } from "./prev"` chains.
   */
  resolveGlobalFunctionCall(
    global: ModuleGlobal,
    visited: Set<string> = new Set(),
  ): CallTarget | undefined {
    let current: ModuleGlobal | undefined = global;

    while (current !== undefined) {
      if (current.kind !== "import") {
        return undefined;
      }

      const { name, source } = current;

      // Prevent infinite loops in circular re-export chains.
      const key = `${source}:${name}`;
      if (visited.has(key)) {
        return undefined;
      }
      visited.add(key);

      const moduleIR = this.projectUnit.modules.get(source);
      if (moduleIR === undefined) {
        return undefined;
      }

      const exportPlace = moduleIR.exports.get(name);
      if (exportPlace === undefined || exportPlace.declaration === undefined) {
        return undefined;
      }

      // Follow re-exports to the defining module (stack-safe).
      if (exportPlace.declaration instanceof ExportFromInstruction) {
        const reExportGlobal = moduleIR.globals.get(name);
        if (reExportGlobal === undefined) {
          return undefined;
        }
        current = reExportGlobal;
        continue;
      }

      const funcDeclInstr = moduleIR.environment.placeToInstruction.get(
        exportPlace.declaration.place.id,
      );

      if (funcDeclInstr instanceof FunctionDeclarationInstruction) {
        return { modulePath: source, functionIRId: funcDeclInstr.functionIR.id };
      }
      if (funcDeclInstr instanceof FunctionExpressionInstruction) {
        return { modulePath: source, functionIRId: funcDeclInstr.functionIR.id };
      }
      if (funcDeclInstr instanceof ArrowFunctionExpressionInstruction) {
        return { modulePath: source, functionIRId: funcDeclInstr.functionIR.id };
      }

      return undefined;
    }

    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Project-wide call-graph analysis.
 *
 * Computes forward call edges and a declaration map for every module in the
 * project. Used by {@link FunctionInliningPass} to resolve call targets and
 * detect recursion.
 *
 * Managed by {@link AnalysisManager}: lazily computed via
 * `AM.get(CallGraphAnalysis, projectUnit)`, cached until invalidated.
 *
 * Two-phase construction mirrors a standard Cytron-style approach:
 * 1. **Gather declarations** — register every named function (declaration,
 *    expression, or arrow stored in a local binding) so calls can resolve.
 * 2. **Gather calls** — walk every CallExpressionInstruction and record
 *    forward edges for each statically resolvable callee.
 */
export class CallGraphAnalysis extends ProjectAnalysis<CallGraphResult> {
  run(projectUnit: ProjectUnit, _AM: AnalysisManager): CallGraphResult {
    const calls = new Map<string, Map<FunctionIRId, Set<CallTarget>>>();
    const declarations = new Map<string, Map<DeclarationId, FunctionIRId>>();

    // Initialize empty maps for each module.
    for (const modulePath of projectUnit.postOrder.toReversed()) {
      calls.set(modulePath, new Map());
      declarations.set(modulePath, new Map());
    }

    // Phase 1: gather declarations so call resolution can look them up.
    for (const modulePath of projectUnit.postOrder.toReversed()) {
      const moduleIR = projectUnit.modules.get(modulePath)!;
      gatherDeclarations(moduleIR, declarations.get(modulePath)!);
    }

    // Build a partial result so gatherCalls can use resolveFunctionFromCallExpression.
    const result = new CallGraphResult(calls, declarations, projectUnit);

    // Phase 2: gather call edges.
    for (const modulePath of projectUnit.postOrder.toReversed()) {
      const moduleIR = projectUnit.modules.get(modulePath)!;
      gatherCalls(moduleIR, calls, result);
    }

    return result;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Registers every named function in `moduleIR` into the declaration map.
 *
 * Covers:
 * - `function foo() {}` — FunctionDeclarationInstruction
 * - `const f = function() {}` — StoreLocal whose value is a FunctionExpressionInstruction
 * - `const f = () => {}` — StoreLocal whose value is an ArrowFunctionExpressionInstruction
 */
function gatherDeclarations(
  moduleIR: ModuleIR,
  moduleDecls: Map<DeclarationId, FunctionIRId>,
): void {
  for (const funcIR of moduleIR.functions.values()) {
    for (const block of funcIR.blocks.values()) {
      for (const instr of block.instructions) {
        // function foo() {} — hoisted declaration
        if (instr instanceof FunctionDeclarationInstruction) {
          moduleDecls.set(instr.place.identifier.declarationId, instr.functionIR.id);
          continue;
        }

        // const f = <function expression | arrow>
        if (!(instr instanceof StoreLocalInstruction)) {
          continue;
        }
        const definer = instr.value.identifier.definer;
        if (
          definer instanceof FunctionExpressionInstruction ||
          definer instanceof ArrowFunctionExpressionInstruction
        ) {
          moduleDecls.set(instr.lval.identifier.declarationId, definer.functionIR.id);
        }
      }
    }
  }
}

/**
 * Walks every function in `moduleIR`, resolves CallExpressionInstructions
 * via `result.resolveFunctionFromCallExpression`, and records forward edges.
 */
function gatherCalls(
  moduleIR: ModuleIR,
  calls: Map<string, Map<FunctionIRId, Set<CallTarget>>>,
  result: CallGraphResult,
): void {
  const moduleCalls = calls.get(moduleIR.path)!;

  // Ensure every function has an entry (even if it makes no resolved calls).
  for (const funcIR of moduleIR.functions.values()) {
    if (!moduleCalls.has(funcIR.id)) {
      moduleCalls.set(funcIR.id, new Set());
    }
  }

  // Record call edges.
  for (const funcIR of moduleIR.functions.values()) {
    for (const block of funcIR.blocks.values()) {
      for (const instr of block.instructions) {
        if (!(instr instanceof CallExpressionInstruction)) {
          continue;
        }

        const calleeIR = result.resolveFunctionFromCallExpression(moduleIR, instr);
        if (calleeIR === undefined) {
          continue;
        }

        // Guard: the callee instruction must exist (filters out phantom refs).
        if (moduleIR.environment.placeToInstruction.get(instr.callee.id) === undefined) {
          continue;
        }

        const callerSet = moduleCalls.get(funcIR.id);
        if (callerSet !== undefined) {
          callerSet.add(calleeIR);
        }
      }
    }
  }
}
