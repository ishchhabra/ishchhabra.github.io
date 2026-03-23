import { CompilerOptions } from "../compile";
import { CommonJSExportCollectorPass } from "../frontend/passes/CommonJSExportCollectorPass";
import { ProjectUnit } from "../frontend/ProjectBuilder";
import { BasicBlock, BlockId } from "../ir";
import { CallGraph } from "./analysis/CallGraph";
import { LateOptimizer } from "./late-optimizer/LateOptimizer";
import { ExportDeclarationMergingPass } from "./late-optimizer/passes/ExportDeclarationMergingPass";
import { MergeConsecutiveBlocksPass } from "./MergeConsecutiveBlocksPass";
import { Optimizer } from "./optimizer/Optimizer";
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
    // Remove exports that no other module imports (module-level pass).
    if (this.options.enableUnusedExportEliminationPass) {
      const entryModules = this.entryModules ?? [this.projectUnit.postOrder[0]];
      new UnusedExportEliminationPass(this.projectUnit, entryModules).run();
    }

    // oxlint-disable-next-line typescript/no-explicit-any
    const context = new Map<string, any>();
    const callGraph = new CallGraph(this.projectUnit);
    for (const moduleName of this.projectUnit.postOrder.toReversed()) {
      const moduleIR = this.projectUnit.modules.get(moduleName)!;
      for (const functionIR of moduleIR.functions.values()) {
        new CommonJSExportCollectorPass(functionIR, moduleIR).run();
        new MergeConsecutiveBlocksPass(functionIR, moduleIR).run();

        const ssaBuilderResult = new SSABuilder(functionIR, moduleIR).build();

        // Phase 1: SSA optimization (fixpoint loop).
        if (this.options.enableOptimizer) {
          const optimizerResult = new Optimizer(
            functionIR,
            moduleIR,
            callGraph,
            ssaBuilderResult,
            this.projectUnit,
            this.options,
            context,
          ).run();
          functionIR.blocks = optimizerResult.blocks;
        }

        // Phase 2: SSA elimination.
        new SSAEliminator(functionIR, moduleIR, ssaBuilderResult.phis).eliminate();

        // Phase 3: Post-SSA cleanup (fixpoint loop).
        if (this.options.enableLateOptimizer) {
          const lateOptimizerResult = new LateOptimizer(moduleIR, functionIR, this.options).run();
          functionIR.blocks = lateOptimizerResult.blocks;
        }

        // Phase 4: Output optimization (single-run passes).
        if (this.options.enableExportDeclarationMergingPass) {
          const exportMergingResult = new ExportDeclarationMergingPass(functionIR).run();
          functionIR.blocks = exportMergingResult.blocks;
        }
      }
    }

    return this.projectUnit;
  }
}
