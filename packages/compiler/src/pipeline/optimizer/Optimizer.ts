import { CompilerOptions } from "../../compile";
import { ProjectUnit } from "../../frontend/ProjectBuilder";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { AnalysisManager } from "../analysis/AnalysisManager";
import { AlgebraicSimplificationPass } from "../passes/AlgebraicSimplificationPass";
import { ExpressionInliningPass } from "../passes/ExpressionInliningPass";
import { SparseConditionalConstantPropagationPass } from "../passes/SparseConditionalConstantPropagationPass";
import { FunctionInliningPass } from "../passes/FunctionInliningPass";
import { CapturePruningPass } from "../passes/CapturePruningPass";
import { DeadCodeEliminationPass } from "../passes/DeadCodeEliminationPass";
import { PhiOptimizationPass } from "../passes/PhiOptimizationPass";
import { CFGSimplificationPass } from "../CFGSimplificationPass";
import { ScalarReplacementOfAggregatesPass } from "../late-optimizer/passes/ScalarReplacementOfAggregatesPass";
import { SSA } from "../ssa/SSABuilder";

interface OptimizerResult {
  changed: boolean;
}

export class Optimizer {
  constructor(
    private readonly functionIR: FunctionIR,
    private readonly moduleIR: ModuleIR,
    private readonly ssa: SSA,
    private readonly projectUnit: ProjectUnit,
    private readonly options: CompilerOptions,
    // oxlint-disable-next-line typescript/no-explicit-any
    private readonly context: Map<string, any>,
    private readonly AM: AnalysisManager,
  ) {}

  public run(): OptimizerResult {
    let anyChanged = false;
    let iterationChanged = true;

    while (iterationChanged) {
      iterationChanged = false;

      const runPass = (changed: boolean) => {
        if (changed) {
          iterationChanged = true;
          this.AM.invalidateFunction(this.functionIR);
        }
      };

      if (this.options.enableConstantPropagationPass) {
        runPass(
          new SparseConditionalConstantPropagationPass(
            this.functionIR,
            this.moduleIR,
            this.projectUnit,
            this.ssa,
            this.context,
            this.options,
            this.AM,
          ).run().changed,
        );
      }

      if (this.options.enableAlgebraicSimplificationPass) {
        runPass(new AlgebraicSimplificationPass(this.functionIR).run().changed);
      }

      if (this.options.enableExpressionInliningPass) {
        runPass(
          new ExpressionInliningPass(this.functionIR, this.moduleIR.environment).run().changed,
        );
      }

      runPass(new CFGSimplificationPass(this.functionIR, this.moduleIR, this.AM).run().changed);

      if (this.options.enablePhiOptimizationPass) {
        runPass(
          new PhiOptimizationPass(this.functionIR, this.moduleIR.environment, this.AM).run()
            .changed,
        );
      }

      if (this.options.enableCapturePruningPass) {
        runPass(new CapturePruningPass(this.functionIR).run().changed);
      }

      if (this.options.enableDeadCodeEliminationPass) {
        runPass(
          new DeadCodeEliminationPass(this.functionIR, this.moduleIR.environment, this.AM).run()
            .changed,
        );
      }

      if (this.options.enableFunctionInliningPass) {
        runPass(
          new FunctionInliningPass(this.functionIR, this.moduleIR, this.AM, this.projectUnit).run()
            .changed,
        );
      }

      if (this.options.enableScalarReplacementOfAggregatesPass) {
        runPass(
          new ScalarReplacementOfAggregatesPass(
            this.functionIR,
            this.moduleIR.environment,
            this.AM,
          ).run().changed,
        );
      }

      anyChanged ||= iterationChanged;
    }

    return { changed: anyChanged };
  }
}
