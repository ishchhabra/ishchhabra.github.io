import { CompilerOptions } from "../compile";
import { CommonJSExportCollectorPass } from "../frontend/passes/CommonJSExportCollectorPass";
import { ProjectUnit } from "../frontend/ProjectBuilder";
import { printModuleIR } from "../ir/printer";
import { AnalysisManager } from "./analysis/AnalysisManager";
import { LateOptimizer } from "./late-optimizer/LateOptimizer";
import { ExportDeclarationMergingPass } from "./late-optimizer/passes/ExportDeclarationMergingPass";
import { CFGSimplificationPass } from "./CFGSimplificationPass";
import { Optimizer } from "./optimizer/Optimizer";
import { computeProcessingOrder } from "./processingOrder";
import { UnusedExportEliminationPass } from "./passes/UnusedExportEliminationPass";
import { SSABuilder } from "./ssa/SSABuilder";
import { SSAEliminator } from "./ssa/SSAEliminator";

export interface PipelineSnapshots {
  ssa: string | null;
  optimized: string | null;
  ssaEliminated: string | null;
  lateOptimized: string | null;
}

export class StagedPipeline {
  constructor(
    private readonly projectUnit: ProjectUnit,
    private readonly options: CompilerOptions,
  ) {}

  public run(): PipelineSnapshots {
    const snapshots: PipelineSnapshots = {
      ssa: null,
      optimized: null,
      ssaEliminated: null,
      lateOptimized: null,
    };

    if (this.options.enableUnusedExportEliminationPass) {
      const entryModules = [this.projectUnit.postOrder[0]];
      new UnusedExportEliminationPass(this.projectUnit, entryModules).run();
    }

    const AM = new AnalysisManager();
    const context = new Map<string, any>();

    for (const moduleName of this.projectUnit.postOrder.toReversed()) {
      const moduleIR = this.projectUnit.modules.get(moduleName)!;
      const processingOrder = computeProcessingOrder(moduleIR);

      for (const functionIR of processingOrder) {
        new CommonJSExportCollectorPass(functionIR, moduleIR, AM).run();
        new CFGSimplificationPass(functionIR, moduleIR, AM).run();
        AM.invalidateFunction(functionIR);

        new SSABuilder(functionIR, moduleIR, AM).build();
        snapshots.ssa = printModuleIR(moduleIR);

        if (this.options.enableOptimizer) {
          const optimizerResult = new Optimizer(
            functionIR,
            moduleIR,
            { phis: functionIR.phis },
            this.projectUnit,
            this.options,
            context,
            AM,
          ).run();
          functionIR.blocks = optimizerResult.blocks;
        }
        snapshots.optimized = printModuleIR(moduleIR);

        new SSAEliminator(functionIR, moduleIR).eliminate();
        AM.invalidateFunction(functionIR);
        snapshots.ssaEliminated = printModuleIR(moduleIR);

        if (this.options.enableLateOptimizer) {
          const lateOptimizerResult = new LateOptimizer(
            moduleIR,
            functionIR,
            this.options,
            AM,
          ).run();
          functionIR.blocks = lateOptimizerResult.blocks;
        }

        if (this.options.enableExportDeclarationMergingPass) {
          const exportMergingResult = new ExportDeclarationMergingPass(functionIR).run();
          functionIR.blocks = exportMergingResult.blocks;
        }
        snapshots.lateOptimized = printModuleIR(moduleIR);

      }
    }

    return snapshots;
  }
}
