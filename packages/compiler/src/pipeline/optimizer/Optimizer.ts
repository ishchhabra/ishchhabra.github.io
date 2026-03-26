import { CompilerOptions } from "../../compile";
import { ProjectUnit } from "../../frontend/ProjectBuilder";
import { BasicBlock, BlockId } from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { CallGraph } from "../analysis/CallGraph";
import { AlgebraicSimplificationPass } from "../passes/AlgebraicSimplificationPass";
import { ConstantPropagationPass } from "../passes/ConstantPropagationPass";
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
  ) {}

  public run(): OptimizerResult {
    let changed = true;

    let blocks = this.functionIR.blocks;
    while (changed) {
      changed = false;
      if (this.options.enableConstantPropagationPass) {
        const constantPropagationResult = new ConstantPropagationPass(
          this.functionIR,
          this.moduleIR,
          this.projectUnit,
          this.ssa,
          this.context,
          this.options,
        ).run();
        changed ||= constantPropagationResult.changed;
        blocks = constantPropagationResult.blocks;
      }

      if (this.options.enableAlgebraicSimplificationPass) {
        const algebraicSimplificationResult = new AlgebraicSimplificationPass(
          this.functionIR,
        ).run();
        changed ||= algebraicSimplificationResult.changed;
        blocks = algebraicSimplificationResult.blocks;
      }

      {
        const cfgSimplificationResult = new CFGSimplificationPass(
          this.functionIR,
          this.moduleIR,
          this.ssa.phis,
        ).run();
        changed ||= cfgSimplificationResult.changed;
        blocks = cfgSimplificationResult.blocks;
      }

      if (this.options.enablePhiOptimizationPass) {
        const phiOptimizationResult = new PhiOptimizationPass(
          this.functionIR,
          this.ssa.phis,
          this.moduleIR.environment,
        ).run();
        changed ||= phiOptimizationResult.changed;
        blocks = phiOptimizationResult.blocks;
      }

      if (this.options.enableCapturePruningPass) {
        const capturePruningResult = new CapturePruningPass(this.functionIR).run();
        changed ||= capturePruningResult.changed;
        blocks = capturePruningResult.blocks;
      }

      if (this.options.enableDeadCodeEliminationPass) {
        const deadCodeEliminationResult = new DeadCodeEliminationPass(
          this.functionIR,
          this.ssa.phis,
          this.moduleIR.environment,
        ).run();
        changed ||= deadCodeEliminationResult.changed;
        blocks = deadCodeEliminationResult.blocks;
      }

      if (this.options.enableFunctionInliningPass) {
        const functionInliningResult = new FunctionInliningPass(
          this.functionIR,
          this.moduleIR,
          this.callGraph,
          this.projectUnit,
          this.ssa.phis,
        ).run();
        changed ||= functionInliningResult.changed;
        blocks = functionInliningResult.blocks;
      }
    }

    return { blocks };
  }
}
