import { CompilerOptions } from "../../compile";
import { FuncOp } from "../../ir/core/FuncOp";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { AnalysisManager } from "../analysis/AnalysisManager";
import { LateConstantPropagationPass } from "./passes/LateConstantPropagationPass";
import { LateCopyCoalescingPass } from "./passes/LateCopyCoalescingPass";
import { LateCopyFoldingPass } from "./passes/LateCopyFoldingPass";
import { LateCopyPropagationPass } from "./passes/LateCopyPropagationPass";
import { LateDeadCodeEliminationPass } from "./passes/LateDeadCodeEliminationPass";

interface LateOptimizerResult {
  changed: boolean;
}

/**
 * Post-SSA cleanup optimizer.
 *
 * Runs after SSA elimination to clean up artifacts (redundant copies,
 * dead stores, load-store chains) introduced by phi elimination.
 * Passes run in a fixpoint loop until no pass reports changes.
 *
 * ExportDeclarationMerging is NOT part of this optimizer — it is a
 * lowering concern and runs separately in the pipeline.
 */
export class LateOptimizer {
  constructor(
    private readonly moduleIR: ModuleIR,
    private readonly funcOp: FuncOp,
    private readonly options: CompilerOptions,
    private readonly AM: AnalysisManager,
  ) {}

  public run(): LateOptimizerResult {
    let anyChanged = false;
    let iterationChanged = true;

    while (iterationChanged) {
      iterationChanged = false;

      if (this.options.enableLateConstantPropagationPass) {
        if (new LateConstantPropagationPass(this.funcOp, this.AM).run().changed) {
          iterationChanged = true;
          this.AM.invalidateFunction(this.funcOp);
        }
      }

      if (this.options.enableLateCopyPropagationPass) {
        if (new LateCopyPropagationPass(this.funcOp, this.AM).run().changed) {
          iterationChanged = true;
          this.AM.invalidateFunction(this.funcOp);
        }
      }

      if (this.options.enableLateCopyFoldingPass) {
        if (new LateCopyFoldingPass(this.funcOp).run().changed) {
          iterationChanged = true;
          this.AM.invalidateFunction(this.funcOp);
        }
      }

      if (this.options.enableLateCopyCoalescingPass) {
        if (new LateCopyCoalescingPass(this.funcOp).run().changed) {
          iterationChanged = true;
          this.AM.invalidateFunction(this.funcOp);
        }
      }

      if (this.options.enableLateDeadCodeEliminationPass) {
        if (
          new LateDeadCodeEliminationPass(this.funcOp, this.moduleIR.environment).run().changed
        ) {
          iterationChanged = true;
          this.AM.invalidateFunction(this.funcOp);
        }
      }

      anyChanged ||= iterationChanged;
    }

    return { changed: anyChanged };
  }
}
