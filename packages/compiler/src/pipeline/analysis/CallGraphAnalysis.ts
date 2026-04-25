import { ProjectUnit } from "../../frontend/ProjectBuilder";
import {
  CallExpressionOp,
  DeclarationId,
  FunctionDeclarationOp,
  LoadGlobalOp,
  LoadLocalOp,
  StoreLocalOp,
} from "../../ir";
import { ArrowFunctionExpressionOp } from "../../ir/ops/func/ArrowFunctionExpression";
import { FunctionExpressionOp } from "../../ir/ops/func/FunctionExpression";
import { FuncOpId } from "../../ir/core/FuncOp";
import { ModuleGlobal, ModuleIR } from "../../ir/core/ModuleIR";
import { ExportFromOp } from "../../ir/ops/module/ExportFrom";
import { AnalysisManager, ProjectAnalysis } from "./AnalysisManager";

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/** A resolved call target: module path + function ID within that module. */
export interface CallTarget {
  readonly modulePath: string;
  readonly funcOpId: FuncOpId;
}

/**
 * Immutable result of call-graph analysis.
 *
 * Holds forward edges (caller → callees) and a declaration map
 * (DeclarationId → FuncOpId) that enables call resolution.
 *
 * Query methods:
 * - {@link getCallees} — forward lookup
 * - {@link resolveFunctionFromCallExpression} — resolve a CallExpressionOp
 * - {@link resolveGlobalFunctionCall} — resolve a cross-module import call
 */
export class CallGraphResult {
  constructor(
    /** Forward edges: modulePath → (functionId → set of callees). */
    private readonly calls: Map<string, Map<FuncOpId, Set<CallTarget>>>,
    /** Declaration lookup: modulePath → (declarationId → functionId). */
    private readonly declarations: Map<string, Map<DeclarationId, FuncOpId>>,
    private readonly projectUnit: ProjectUnit,
  ) {}

  /** Forward lookup: which functions does (modulePath, functionId) call? */
  getCallees(modulePath: string, functionId: FuncOpId): Set<CallTarget> {
    return this.calls.get(modulePath)?.get(functionId) ?? new Set();
  }

  /**
   * Resolves the callee of a {@link CallExpressionOp}.
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
    callExpression: CallExpressionOp,
  ): CallTarget | undefined {
    const loadInstr = callExpression.callee.def;

    if (loadInstr instanceof LoadGlobalOp) {
      const global = moduleIR.globals.get(loadInstr.name);
      return global !== undefined ? this.resolveGlobalFunctionCall(global) : undefined;
    }

    if (loadInstr instanceof LoadLocalOp) {
      const declarationId = loadInstr.value.declarationId;
      const funcIRId = this.declarations.get(moduleIR.path)?.get(declarationId);
      if (funcIRId !== undefined) {
        return { modulePath: moduleIR.path, funcOpId: funcIRId };
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
      if (exportPlace.declaration instanceof ExportFromOp) {
        const reExportGlobal = moduleIR.globals.get(name);
        if (reExportGlobal === undefined) {
          return undefined;
        }
        current = reExportGlobal;
        continue;
      }

      const funcDeclInstr = exportPlace.declaration.place!.def;

      if (funcDeclInstr instanceof FunctionDeclarationOp) {
        return { modulePath: source, funcOpId: funcDeclInstr.funcOp.id };
      }
      if (funcDeclInstr instanceof FunctionExpressionOp) {
        return { modulePath: source, funcOpId: funcDeclInstr.funcOp.id };
      }
      if (funcDeclInstr instanceof ArrowFunctionExpressionOp) {
        return { modulePath: source, funcOpId: funcDeclInstr.funcOp.id };
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
 * 2. **Gather calls** — walk every CallExpressionOp and record
 *    forward edges for each statically resolvable callee.
 */
export class CallGraphAnalysis extends ProjectAnalysis<CallGraphResult> {
  run(projectUnit: ProjectUnit, _AM: AnalysisManager): CallGraphResult {
    const calls = new Map<string, Map<FuncOpId, Set<CallTarget>>>();
    const declarations = new Map<string, Map<DeclarationId, FuncOpId>>();

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
 * - `function foo() {}` — FunctionDeclarationOp
 * - `const f = function() {}` — StoreLocal whose value is a FunctionExpressionOp
 * - `const f = () => {}` — StoreLocal whose value is an ArrowFunctionExpressionOp
 */
function gatherDeclarations(moduleIR: ModuleIR, moduleDecls: Map<DeclarationId, FuncOpId>): void {
  for (const funcIR of moduleIR.functions.values()) {
    for (const block of funcIR.blocks) {
      for (const instr of block.operations) {
        // function foo() {} — hoisted declaration
        if (instr instanceof FunctionDeclarationOp) {
          moduleDecls.set(instr.place.declarationId, instr.funcOp.id);
          continue;
        }

        // const f = <function expression | arrow>
        if (!(instr instanceof StoreLocalOp)) {
          continue;
        }
        const definer = instr.value.def;
        if (
          definer instanceof FunctionExpressionOp ||
          definer instanceof ArrowFunctionExpressionOp
        ) {
          moduleDecls.set(instr.lval.declarationId, definer.funcOp.id);
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
  calls: Map<string, Map<FuncOpId, Set<CallTarget>>>,
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
    for (const block of funcIR.blocks) {
      for (const instr of block.operations) {
        if (!(instr instanceof CallExpressionOp)) {
          continue;
        }

        const calleeIR = result.resolveFunctionFromCallExpression(moduleIR, instr);
        if (calleeIR === undefined) {
          continue;
        }

        // Guard: the callee instruction must exist (filters out phantom refs).
        if (instr.callee.def === undefined) {
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
