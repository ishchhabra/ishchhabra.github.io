import { CompilerOptions } from "../compile";
import { ProjectUnit } from "../frontend/ProjectBuilder";
import { AnalysisManager } from "./analysis/AnalysisManager";
import { buildFunctionPipeline } from "./FunctionPipeline";
import type { PipelineObserver } from "./Observer";
import { FunctionPassManager } from "./PassManager";
import { computeProcessingOrder } from "./processingOrder";
import { UnusedExportEliminationPass } from "./passes/UnusedExportEliminationPass";

/**
 * Project-level compilation driver. Runs per-function:
 *
 *   CommonJS export collection → SSA construction → SSA optimization
 *   → out-of-SSA → post-SSA cleanup → JS materialization
 *   → export merging
 *
 * An optional {@link PipelineObserver} receives stage-boundary and
 * per-pass events. The observer is the sole extension point for
 * diagnostics (IR snapshots, pass timings, post-stage verification);
 * the pipeline itself stays focused on transforms.
 */
export class Pipeline {
  constructor(
    private readonly projectUnit: ProjectUnit,
    private readonly options: CompilerOptions,
    private readonly entryModules?: string[],
    private readonly observer?: PipelineObserver,
  ) {}

  public run(): ProjectUnit {
    if (this.options.enableUnusedExportEliminationPass) {
      const entryModules = this.entryModules ?? [this.projectUnit.postOrder[0]];
      new UnusedExportEliminationPass(this.projectUnit, entryModules).run();
    }

    const AM = new AnalysisManager();
    const functionPipeline = buildFunctionPipeline(this.projectUnit, this.options);
    const functionPassManager = new FunctionPassManager(AM, this.observer);

    for (const moduleName of this.projectUnit.postOrder.toReversed()) {
      const moduleIR = this.projectUnit.modules.get(moduleName)!;
      const processingOrder = computeProcessingOrder(moduleIR);

      for (const funcOp of processingOrder) {
        for (const phase of functionPipeline) {
          if (phase.fixpoint === true) {
            functionPassManager.runToFixpoint(funcOp, phase.passes);
          } else {
            functionPassManager.runOnce(funcOp, phase.passes);
          }
          if (phase.stage !== undefined) {
            this.observer?.onStage?.(phase.stage, moduleIR, funcOp);
          }
        }
      }
    }

    return this.projectUnit;
  }
}
