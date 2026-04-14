import type { FuncOp } from "../../ir/core/FuncOp";
import type { ProjectUnit } from "../../frontend/ProjectBuilder";

/**
 * Base class for analyses that operate on a single function.
 *
 * A function analysis reads the IR for one function and produces a
 * cached result. It may request other analyses (function-level or
 * project-level) via the AnalysisManager it receives.
 *
 * Implementations must be side-effect-free: `run` is called lazily and
 * the result is cached until invalidated.
 */
export abstract class FunctionAnalysis<Result> {
  abstract run(funcOp: FuncOp, AM: AnalysisManager): Result;
}

/**
 * Base class for analyses that operate on the whole project.
 *
 * A project analysis reads the full ProjectUnit (all modules) and
 * produces a cached result. It may request other project-level
 * analyses via the AnalysisManager.
 */
export abstract class ProjectAnalysis<Result> {
  abstract run(projectUnit: ProjectUnit, AM: AnalysisManager): Result;
}

// Constructor types used as cache keys.
type FunctionAnalysisClass<Result> = new (...args: never[]) => FunctionAnalysis<Result>;
type ProjectAnalysisClass<Result> = new (...args: never[]) => ProjectAnalysis<Result>;

/**
 * Tracks which analyses a transform pass preserved.
 *
 * After a pass modifies the IR, the AnalysisManager uses this to
 * decide which cached results to keep and which to discard.
 *
 * The safe default is `PreservedAnalyses.none()` — all caches are
 * cleared. Passes that know they only modify instruction operands
 * (not the CFG) can preserve structural analyses like DominatorTree.
 */
export class PreservedAnalyses {
  private readonly preserved = new Set<unknown>();
  private _all = false;

  /** Mark a specific analysis as still valid. */
  preserve(analysisClass: FunctionAnalysisClass<unknown> | ProjectAnalysisClass<unknown>): void {
    this.preserved.add(analysisClass);
  }

  /** Check if a specific analysis was preserved. */
  isPreserved(
    analysisClass: FunctionAnalysisClass<unknown> | ProjectAnalysisClass<unknown>,
  ): boolean {
    return this._all || this.preserved.has(analysisClass);
  }

  /** Nothing was preserved — invalidate all cached analyses. */
  static none(): PreservedAnalyses {
    return new PreservedAnalyses();
  }

  /** Everything was preserved — no caches need clearing. */
  static all(): PreservedAnalyses {
    const pa = new PreservedAnalyses();
    pa._all = true;
    return pa;
  }
}

/**
 * Lazily computes, caches, and invalidates analysis results.
 *
 * Analyses are computed on first access via `get()` and cached until
 * a transform pass invalidates them. Supports two levels:
 *
 * - **Function-level**: cached per FuncOp, invalidated when that
 *   function's IR changes.
 * - **Project-level**: cached once for the whole ProjectUnit,
 *   invalidated when cross-module structure changes.
 *
 * Analyses may depend on other analyses by calling `AM.get()` inside
 * their own `run()` method. The manager handles caching at every level.
 *
 * Usage:
 * ```ts
 * const liveness = AM.get(LivenessAnalysis, funcOp);
 * const callGraph = AM.get(CallGraphAnalysis, projectUnit);
 * ```
 */
export class AnalysisManager {
  /**
   * Per-function analysis caches, keyed by {@link FuncOp} **identity**
   * (not {@link FuncOpId}): ids are unique per module, so two entry
   * functions in different modules can share the same numeric id.
   */
  private readonly functionCaches = new Map<
    FuncOp,
    Map<FunctionAnalysisClass<unknown>, unknown>
  >();

  /** Project-level analysis cache. */
  private readonly projectCache = new Map<ProjectAnalysisClass<unknown>, unknown>();

  /**
   * Get an analysis result for a FuncOp or ProjectUnit.
   *
   * Dispatches based on the second argument's type:
   * - FuncOp → function-level analysis (cached per function)
   * - ProjectUnit → project-level analysis (cached globally)
   *
   * Computes lazily on first access, returns cached result on
   * subsequent calls until invalidated.
   */
  get<Result>(analysisClass: FunctionAnalysisClass<Result>, ir: FuncOp): Result;
  get<Result>(analysisClass: ProjectAnalysisClass<Result>, ir: ProjectUnit): Result;
  get<Result>(
    analysisClass: FunctionAnalysisClass<Result> | ProjectAnalysisClass<Result>,
    ir: FuncOp | ProjectUnit,
  ): Result {
    if (isFuncOp(ir)) {
      return this.getFunction(analysisClass as FunctionAnalysisClass<Result>, ir);
    }
    return this.getProject(analysisClass as ProjectAnalysisClass<Result>, ir);
  }

  private getFunction<Result>(
    analysisClass: FunctionAnalysisClass<Result>,
    funcOp: FuncOp,
  ): Result {
    let cache = this.functionCaches.get(funcOp);
    if (!cache) {
      cache = new Map();
      this.functionCaches.set(funcOp, cache);
    }

    const key = analysisClass as FunctionAnalysisClass<unknown>;
    if (!cache.has(key)) {
      const analysis = new (analysisClass as new () => FunctionAnalysis<Result>)();
      cache.set(key, analysis.run(funcOp, this));
    }

    return cache.get(key) as Result;
  }

  private getProject<Result>(
    analysisClass: ProjectAnalysisClass<Result>,
    projectUnit: ProjectUnit,
  ): Result {
    const key = analysisClass as ProjectAnalysisClass<unknown>;
    if (!this.projectCache.has(key)) {
      const analysis = new (analysisClass as new () => ProjectAnalysis<Result>)();
      this.projectCache.set(key, analysis.run(projectUnit, this));
    }

    return this.projectCache.get(key) as Result;
  }

  /**
   * Invalidate cached analyses for a single function.
   *
   * Called after a transform pass modifies a function's IR.
   * Accepts a PreservedAnalyses to selectively keep valid caches.
   */
  invalidateFunction(
    funcOp: FuncOp,
    preserved: PreservedAnalyses = PreservedAnalyses.none(),
  ): void {
    const cache = this.functionCaches.get(funcOp);
    if (!cache) return;

    for (const analysisClass of cache.keys()) {
      if (!preserved.isPreserved(analysisClass)) {
        cache.delete(analysisClass);
      }
    }
  }

  /**
   * Invalidate all project-level cached analyses.
   *
   * Called when cross-module structure changes (exports modified,
   * modules added/removed, etc.).
   */
  invalidateProject(preserved: PreservedAnalyses = PreservedAnalyses.none()): void {
    for (const analysisClass of this.projectCache.keys()) {
      if (!preserved.isPreserved(analysisClass)) {
        this.projectCache.delete(analysisClass);
      }
    }
  }
}

function isFuncOp(ir: FuncOp | ProjectUnit): ir is FuncOp {
  return "body" in ir && "id" in ir;
}
