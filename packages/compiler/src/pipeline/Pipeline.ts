import { CompilerOptions } from "../compile";
import { CommonJSExportCollectorPass } from "../frontend/passes/CommonJSExportCollectorPass";
import { ProjectUnit } from "../frontend/ProjectBuilder";
import { BasicBlock, BlockId } from "../ir";
import { AnalysisManager } from "./analysis/AnalysisManager";
import { LateOptimizer } from "./late-optimizer/LateOptimizer";
import { ExportDeclarationMergingPass } from "./late-optimizer/passes/ExportDeclarationMergingPass";
import { ValueMaterializationPass } from "./passes/ValueMaterializationPass";
import { Optimizer } from "./optimizer/Optimizer";
import { computeProcessingOrder } from "./processingOrder";
import { UnusedExportEliminationPass } from "./passes/UnusedExportEliminationPass";
import { SSABuilder } from "./ssa/SSABuilder";
import { SSAEliminator } from "./ssa/SSAEliminator";

export interface PipelineResult {
  blocks: Map<BlockId, BasicBlock>;
}

export class Pipeline {
  constructor(
    private readonly projectUnit: ProjectUnit,
    private readonly options: CompilerOptions,
    private readonly entryModules?: string[],
  ) {}

  public run() {
    if (this.options.enableUnusedExportEliminationPass) {
      const entryModules = this.entryModules ?? [this.projectUnit.postOrder[0]];
      new UnusedExportEliminationPass(this.projectUnit, entryModules).run();
    }

    const AM = new AnalysisManager();
    // oxlint-disable-next-line typescript/no-explicit-any
    const context = new Map<string, any>();

    for (const moduleName of this.projectUnit.postOrder.toReversed()) {
      const moduleIR = this.projectUnit.modules.get(moduleName)!;
      const processingOrder = computeProcessingOrder(moduleIR);

      for (const funcOp of processingOrder) {
        new CommonJSExportCollectorPass(funcOp, moduleIR, AM).run();
        AM.invalidateFunction(funcOp);

        // SSA construction: adds block params to merge blocks and
        // rewrites reads to reaching defs, textbook Cytron style.
        new SSABuilder(funcOp, moduleIR, AM).build();

        if (this.options.enableOptimizer) {
          new Optimizer(funcOp, moduleIR, this.projectUnit, this.options, context, AM).run();
        }

        // Out-of-SSA lowering: materialize block params as `let`
        // variables and insert copy stores at each predecessor.
        new SSAEliminator(funcOp, moduleIR).eliminate();
        AM.invalidateFunction(funcOp);

        if (this.options.enableLateOptimizer) {
          new LateOptimizer(moduleIR, funcOp, this.options, AM).run();
        }

        new ValueMaterializationPass(funcOp, moduleIR).run();

        if (this.options.enableExportDeclarationMergingPass) {
          new ExportDeclarationMergingPass(funcOp).run();
        }
      }
    }

    return this.projectUnit;
  }
}
