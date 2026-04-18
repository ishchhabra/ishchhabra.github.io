import { CompilerOptions } from "../compile";
import { CommonJSExportCollectorPass } from "../frontend/passes/CommonJSExportCollectorPass";
import { ProjectUnit } from "../frontend/ProjectBuilder";
import { AnalysisManager } from "./analysis/AnalysisManager";
import { LateOptimizer } from "./late-optimizer/LateOptimizer";
import { ExportDeclarationMergingPass } from "./late-optimizer/passes/ExportDeclarationMergingPass";
import type { PipelineObserver } from "./Observer";
import { ValueMaterializationPass } from "./passes/ValueMaterializationPass";
import { Optimizer } from "./optimizer/Optimizer";
import { computeProcessingOrder } from "./processingOrder";
import { UnusedExportEliminationPass } from "./passes/UnusedExportEliminationPass";
import { SSABuilder } from "./ssa/SSABuilder";
import { SSAEliminator } from "./ssa/SSAEliminator";

/**
 * Project-level compilation driver. Runs per-function:
 *
 *   SSA construction → optimizer → SSA elimination → late optimizer
 *   → value materialization → export-declaration merging
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

    for (const moduleName of this.projectUnit.postOrder.toReversed()) {
      const moduleIR = this.projectUnit.modules.get(moduleName)!;
      const processingOrder = computeProcessingOrder(moduleIR);

      for (const funcOp of processingOrder) {
        new CommonJSExportCollectorPass(funcOp, moduleIR, AM).run();
        AM.invalidateFunction(funcOp);

        // SSA construction: adds block params to merge blocks and
        // rewrites reads to reaching defs, textbook Cytron style.
        new SSABuilder(funcOp, moduleIR, AM).build();
        this.observer?.onStage?.("ssa-built", moduleIR, funcOp);

        if (this.options.enableOptimizer) {
          new Optimizer(funcOp, this.options, AM, this.observer).run();
        }
        this.observer?.onStage?.("optimized", moduleIR, funcOp);

        // Out-of-SSA lowering: materialize block params as `let`
        // variables and insert copy stores at each predecessor.
        new SSAEliminator(funcOp, moduleIR).eliminate();
        AM.invalidateFunction(funcOp);
        this.observer?.onStage?.("ssa-eliminated", moduleIR, funcOp);

        if (this.options.enableLateOptimizer) {
          new LateOptimizer(funcOp, this.options, AM, this.observer).run();
        }
        this.observer?.onStage?.("late-optimized", moduleIR, funcOp);

        new ValueMaterializationPass(funcOp, moduleIR).run();
        this.observer?.onStage?.("materialized", moduleIR, funcOp);

        if (this.options.enableExportDeclarationMergingPass) {
          new ExportDeclarationMergingPass(funcOp).run();
        }
        this.observer?.onStage?.("exports-merged", moduleIR, funcOp);
      }
    }

    return this.projectUnit;
  }
}
