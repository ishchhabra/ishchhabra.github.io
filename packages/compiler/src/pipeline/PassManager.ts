import type { FuncOp } from "../ir/core/FuncOp";
import type { ProjectUnit } from "../frontend/ProjectBuilder";
import { AnalysisManager, PreservedAnalyses } from "./analysis/AnalysisManager";
import type { PipelineObserver } from "./Observer";

/**
 * The result returned by a single pass run.
 *
 * `changed` — did this pass modify the IR?
 * `preserved` — analyses this pass did NOT invalidate. Default is
 * `PreservedAnalyses.none()` (safe — everything is recomputed).
 *
 * Passes that only rewrite operands (not CFG) should preserve
 * structural analyses like `DominatorTreeAnalysis` so the cache is
 * not thrown away across the pipeline.
 */
export interface PassResult {
  readonly changed: boolean;
  readonly preserved?: PreservedAnalyses;
}

/**
 * Function-level transform pass. Operates on a single {@link FuncOp}
 * in place and returns what changed + what analyses survived.
 *
 * `name` is for diagnostics and future pass scheduling / logging.
 */
export interface FunctionPass {
  readonly name: string;
  run(funcOp: FuncOp, AM: AnalysisManager): PassResult;
}

/** Project-level transform pass. Operates on the whole {@link ProjectUnit}. */
export interface ProjectPass {
  readonly name: string;
  run(projectUnit: ProjectUnit, AM: AnalysisManager): PassResult;
}

/**
 * Adapter for legacy pass classes whose `.run()` returns
 * `{ changed: boolean }` and whose constructor takes `(funcOp, …)`.
 *
 * Usage:
 * ```ts
 * funcPass("dce", (f, am) => new DeadCodeEliminationPass(f, f.moduleIR.environment, am));
 * ```
 *
 * Pass `preserved` to declare which analyses survive this pass;
 * omit for the safe default (invalidate everything).
 */
export function funcPass(
  name: string,
  factory: (funcOp: FuncOp, AM: AnalysisManager) => { run(): { changed: boolean } },
  preserved?: PreservedAnalyses,
): FunctionPass {
  return {
    name,
    run(funcOp, AM) {
      const { changed } = factory(funcOp, AM).run();
      return { changed, preserved };
    },
  };
}

/**
 * Drives a sequence of function passes over a single {@link FuncOp}
 * and threads {@link PreservedAnalyses} through the analysis cache
 * so passes that declare what they preserve don't needlessly wipe
 * valid results.
 *
 * Two drivers:
 *
 *   - {@link runOnce} runs every pass in the list exactly once. This
 *     is the "scripted pipeline" shape LLVM uses: the pass list
 *     itself encodes which passes re-run and in what order.
 *   - {@link runToFixpoint} re-runs the whole list until a complete
 *     pass reports no changes. Convenient for small monotonic
 *     pipelines; avoid when passes are non-monotonic or expensive.
 */
export class FunctionPassManager {
  constructor(
    private readonly AM: AnalysisManager,
    private readonly observer?: PipelineObserver,
  ) {}

  /**
   * Run every pass in `passes` once against `funcOp`. Between passes,
   * invalidate the analysis cache minus whatever the just-completed
   * pass declared preserved. Fires `onPassStart` / `onPassEnd` on the
   * observer if attached. Returns whether any pass changed the IR.
   */
  runOnce(funcOp: FuncOp, passes: readonly FunctionPass[]): { changed: boolean } {
    let anyChanged = false;
    for (const pass of passes) {
      this.observer?.onPassStart?.(pass.name, funcOp);
      const result = pass.run(funcOp, this.AM);
      this.observer?.onPassEnd?.(pass.name, funcOp, result);
      if (result.changed) {
        anyChanged = true;
        this.AM.invalidateFunction(funcOp, result.preserved ?? PreservedAnalyses.none());
      }
    }
    return { changed: anyChanged };
  }

  /**
   * Run the whole sequence to a fixpoint — re-run until a full pass
   * over `passes` reports no changes. Prefer {@link runOnce} with an
   * explicit scripted pipeline; this is kept for small monotonic
   * pipelines and for debugging.
   */
  runToFixpoint(funcOp: FuncOp, passes: readonly FunctionPass[]): { changed: boolean } {
    let anyChanged = false;
    for (;;) {
      const { changed } = this.runOnce(funcOp, passes);
      if (!changed) return { changed: anyChanged };
      anyChanged = true;
    }
  }
}
