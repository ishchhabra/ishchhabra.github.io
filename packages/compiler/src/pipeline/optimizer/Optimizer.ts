import { CompilerOptions } from "../../compile";
import { ProjectUnit } from "../../frontend/ProjectBuilder";
import { BasicBlock, BlockId } from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { AnalysisManager } from "../analysis/AnalysisManager";
import { CallGraph } from "../analysis/CallGraph";
import { AlgebraicSimplificationPass } from "../passes/AlgebraicSimplificationPass";
import { SparseConditionalConstantPropagationPass } from "../passes/SparseConditionalConstantPropagationPass";
import { FunctionInliningPass } from "../passes/FunctionInliningPass";
import { CapturePruningPass } from "../passes/CapturePruningPass";
import { DeadCodeEliminationPass } from "../passes/DeadCodeEliminationPass";
import { PhiOptimizationPass } from "../passes/PhiOptimizationPass";
import { CFGSimplificationPass } from "../CFGSimplificationPass";
import { SSA } from "../ssa/SSABuilder";

interface OptimizerResult {
  blocks: Map<BlockId, BasicBlock>;
}

export class Optimizer {
  constructor(
    private readonly functionIR: FunctionIR,
    private readonly moduleIR: ModuleIR,
    private readonly callGraph: CallGraph,
    private readonly ssa: SSA,
    private readonly projectUnit: ProjectUnit,
    private readonly options: CompilerOptions,
    // oxlint-disable-next-line typescript/no-explicit-any
    private readonly context: Map<string, any>,
    private readonly AM: AnalysisManager,
  ) {}

  public run(): OptimizerResult {
    let changed = true;

    let blocks = this.functionIR.blocks;
    while (changed) {
      changed = false;
      if (this.options.enableConstantPropagationPass) {
        const sccpResult = new SparseConditionalConstantPropagationPass(
          this.functionIR,
          this.moduleIR,
          this.projectUnit,
          this.ssa,
          this.context,
          this.options,
        ).run();
        if (sccpResult.changed) {
          changed = true;
          this.AM.invalidateFunction(this.functionIR);
        }
        blocks = sccpResult.blocks;
      }

      if (this.options.enableAlgebraicSimplificationPass) {
        const algebraicSimplificationResult = new AlgebraicSimplificationPass(
          this.functionIR,
        ).run();
        if (algebraicSimplificationResult.changed) {
          changed = true;
          this.AM.invalidateFunction(this.functionIR);
        }
        blocks = algebraicSimplificationResult.blocks;
      }

      {
        const cfgSimplificationResult = new CFGSimplificationPass(
          this.functionIR,
          this.moduleIR,
        ).run();
        if (cfgSimplificationResult.changed) {
          changed = true;
          this.AM.invalidateFunction(this.functionIR);
        }
        blocks = cfgSimplificationResult.blocks;
      }

      if (this.options.enablePhiOptimizationPass) {
        const phiOptimizationResult = new PhiOptimizationPass(
          this.functionIR,
          this.moduleIR.environment,
        ).run();
        if (phiOptimizationResult.changed) {
          changed = true;
          this.AM.invalidateFunction(this.functionIR);
        }
        blocks = phiOptimizationResult.blocks;
      }

      if (this.options.enableCapturePruningPass) {
        const capturePruningResult = new CapturePruningPass(this.functionIR).run();
        if (capturePruningResult.changed) {
          changed = true;
          this.AM.invalidateFunction(this.functionIR);
        }
        blocks = capturePruningResult.blocks;
      }

      if (this.options.enableDeadCodeEliminationPass) {
        const deadCodeEliminationResult = new DeadCodeEliminationPass(
          this.functionIR,
          this.moduleIR.environment,
          this.AM,
        ).run();
        if (deadCodeEliminationResult.changed) {
          changed = true;
          this.AM.invalidateFunction(this.functionIR);
        }
        blocks = deadCodeEliminationResult.blocks;
      }

      if (this.options.enableFunctionInliningPass) {
        const functionInliningResult = new FunctionInliningPass(
          this.functionIR,
          this.moduleIR,
          this.callGraph,
          this.projectUnit,
        ).run();
        if (functionInliningResult.changed) {
          changed = true;
          this.AM.invalidateFunction(this.functionIR);
        }
        blocks = functionInliningResult.blocks;
      }
    }

    return { blocks };
  }
}
