import { FunctionIR } from "../core/FunctionIR";
import { ModuleIR } from "../core/ModuleIR";

/**
 * Computes cached facts for one function.
 *
 * Implementations must be deterministic and side-effect-free with respect to
 * IR mutation. They may depend on other analyses through `analyses`.
 */
export interface FunctionAnalysis<Result> {
  readonly name: string;
  run(fn: FunctionIR, analyses: AnalysisManager): Result;
}

/**
 * Computes cached facts for one module.
 *
 * Use module analyses for facts that cross function boundaries, such as call
 * graphs, import/export reachability, or module-level binding usage.
 */
export interface ModuleAnalysis<Result> {
  readonly name: string;
  run(moduleIR: ModuleIR, analyses: AnalysisManager): Result;
}

export type FunctionAnalysisKey<Result = unknown> = FunctionAnalysis<Result>;
export type ModuleAnalysisKey<Result = unknown> = ModuleAnalysis<Result>;
export type AnalysisKey = FunctionAnalysisKey | ModuleAnalysisKey;

/**
 * Describes which cached analyses remain valid after a transform pass.
 *
 * The safe default is `none()`: every cached result is invalidated. Passes may
 * return `all()`, `allExcept(...)`, or preserve specific analyses when they can
 * prove those cached facts are still valid.
 */

export class PreservedAnalyses {
  readonly #preserved = new Set<AnalysisKey>();
  readonly #invalidated = new Set<AnalysisKey>();
  #all = false;

  /**
   * Marks one analysis as still valid.
   */
  public preserve(analysis: AnalysisKey): void {
    this.#preserved.add(analysis);
  }

  /**
   * Returns whether an analysis cache may be reused.
   */
  public preserves(analysis: AnalysisKey): boolean {
    return !this.#invalidated.has(analysis) && (this.#preserved.has(analysis) || this.#all);
  }

  /**
   * Invalidates every cached analysis.
   */
  public static none(): PreservedAnalyses {
    return new PreservedAnalyses();
  }

  /**
   * Preserves every cached analysis
   */
  public static all(): PreservedAnalyses {
    const preserved = new PreservedAnalyses();
    preserved.#all = true;
    return preserved;
  }

  /**
   * Preserves all current and future analyses except the listed ones.
   *
   * Use this when a pass has a narrow, well-understood invalidation effect.
   */
  public static allExcept(...analyses: readonly AnalysisKey[]): PreservedAnalyses {
    const preserved = PreservedAnalyses.all();

    for (const analysis of analyses) {
      preserved.#invalidated.add(analysis);
    }

    return preserved;
  }
}

/**
 * Lazily computes and caches analysis results for IR objects.
 *
 * Analyses are pure readers: they may inspect IR and request other analyses,
 * but they must not mutate IR. Transform passes are responsible for
 * invalidating cached results after mutation.
 */
export class AnalysisManager {
  readonly #functionCaches: Map<FunctionIR, Map<AnalysisKey, unknown>> = new Map();
  readonly #moduleCaches: Map<ModuleIR, Map<AnalysisKey, unknown>> = new Map();

  public getFunction<Result>(analysis: FunctionAnalysisKey<Result>, fn: FunctionIR): Result {
    let cache = this.#functionCaches.get(fn);
    if (cache === undefined) {
      cache = new Map();
      this.#functionCaches.set(fn, cache);
    }

    if (!cache.has(analysis)) {
      cache.set(analysis, analysis.run(fn, this));
    }

    return cache.get(analysis) as Result;
  }

  public getModule<Result>(analysis: ModuleAnalysisKey<Result>, module: ModuleIR): Result {
    let cache = this.#moduleCaches.get(module);
    if (cache === undefined) {
      cache = new Map();
      this.#moduleCaches.set(module, cache);
    }

    if (!cache.has(analysis)) {
      cache.set(analysis, analysis.run(module, this));
    }

    return cache.get(analysis) as Result;
  }

  public invalidateFunction(
    fn: FunctionIR,
    preserved: PreservedAnalyses = PreservedAnalyses.none(),
  ): void {
    const cache = this.#functionCaches.get(fn);
    if (cache === undefined) return;

    for (const analysis of cache.keys()) {
      if (!preserved.preserves(analysis)) {
        cache.delete(analysis);
      }
    }
  }

  public invalidateModule(
    moduleIR: ModuleIR,
    preserved: PreservedAnalyses = PreservedAnalyses.none(),
  ): void {
    const cache = this.#moduleCaches.get(moduleIR);
    if (cache === undefined) return;

    for (const analysis of cache.keys()) {
      if (!preserved.preserves(analysis)) {
        cache.delete(analysis);
      }
    }
  }
}
