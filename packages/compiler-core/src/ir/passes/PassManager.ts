import { AnalysisManager, PreservedAnalyses } from "../analysis";
import type { FunctionIR } from "../core/FunctionIR";
import type { ModuleIR } from "../core/ModuleIR";
import type { FunctionPass, ModulePass } from "./Pass";

/**
 * Runs function passes and keeps function analysis caches coherent.
 *
 * Passes run once, in the order provided. When a pass reports a mutation, the
 * manager invalidates cached function analyses except those explicitly
 * preserved by the pass result.
 */
export class FunctionPassManager {
  constructor(private readonly analyses: AnalysisManager) {}

  /**
   * Runs each pass once, in order.
   */
  public run(fn: FunctionIR, passes: readonly FunctionPass[]): { changed: boolean } {
    let anyChanged = false;

    for (const pass of passes) {
      const result = pass.run(fn, this.analyses);

      if (!result.changed) continue;

      anyChanged = true;
      this.analyses.invalidateFunction(fn, result.preserved ?? PreservedAnalyses.none());
    }

    return { changed: anyChanged };
  }
}

/**
 * Runs module passes and keeps module analysis caches coherent.
 *
 * Passes run once, in the order provided. When a pass reports a mutation, the
 * manager invalidates cached module analyses except those explicitly preserved
 * by the pass result.
 */
export class ModulePassManager {
  constructor(private readonly analyses: AnalysisManager) {}

  /**
   * Runs each pass once, in order.
   */
  public run(moduleIR: ModuleIR, passes: readonly ModulePass[]): { changed: boolean } {
    let anyChanged = false;

    for (const pass of passes) {
      const result = pass.run(moduleIR, this.analyses);

      if (!result.changed) continue;

      anyChanged = true;
      this.analyses.invalidateModule(moduleIR, result.preserved ?? PreservedAnalyses.none());
    }

    return { changed: anyChanged };
  }
}
