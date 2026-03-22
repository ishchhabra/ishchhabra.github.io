import { CompilerOptions } from "../../compile";
import { ProjectUnit } from "../../frontend/ProjectBuilder";
import { BasicBlock, BlockId } from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { ExportDeclarationMergingPass } from "./passes/ExportDeclarationMergingPass";
import { LateCopyPropagationPass } from "./passes/LateCopyPropagationPass";
import { LateDeadCodeEliminationPass } from "./passes/LateDeadCodeEliminationPass";
import { LoadStoreForwardingPass } from "./passes/LoadStoreForwardingPass";
import { PhiToTernaryPass } from "./passes/PhiToTernaryPass";
import { RedundantCopyEliminationPass } from "./passes/RedundantCopyEliminationPass";

interface LateOptimizerResult {
  blocks: Map<BlockId, BasicBlock>;
}

export class LateOptimizer {
  constructor(
    private readonly moduleIR: ModuleIR,
    private readonly functionIR: FunctionIR,
    private readonly projectUnit: ProjectUnit,
    private readonly options: CompilerOptions,
  ) {}

  public run(): LateOptimizerResult {
    let blocks = this.functionIR.blocks;
    if (this.options.enablePhiToTernaryPass) {
      const phiToTernaryResult = new PhiToTernaryPass(
        this.functionIR,
        this.moduleIR.environment,
      ).run();
      blocks = phiToTernaryResult.blocks;
    }

    if (this.options.enableLoadStoreForwardingPass) {
      const loadStoreForwardingResult = new LoadStoreForwardingPass(this.functionIR).run();
      blocks = loadStoreForwardingResult.blocks;
    }

    if (this.options.enableRedundantCopyEliminationPass) {
      const redundantStoreEliminationResult = new RedundantCopyEliminationPass(
        this.functionIR,
      ).run();
      blocks = redundantStoreEliminationResult.blocks;
    }

    if (this.options.enableLateCopyPropagationPass) {
      const lateCopyPropagationResult = new LateCopyPropagationPass(this.functionIR).run();
      blocks = lateCopyPropagationResult.blocks;
    }

    if (this.options.enableLateDeadCodeEliminationPass) {
      const lateDeadCodeEliminationResult = new LateDeadCodeEliminationPass(
        this.functionIR,
        this.moduleIR.environment,
      ).run();
      blocks = lateDeadCodeEliminationResult.blocks;
    }

    if (this.options.enableExportDeclarationMergingPass) {
      const exportDeclarationMergingResult = new ExportDeclarationMergingPass(
        this.functionIR,
      ).run();
      blocks = exportDeclarationMergingResult.blocks;
    }

    return { blocks };
  }
}
