import { CompilerOptions } from "../../compile";
import { ProjectUnit } from "../../frontend/ProjectBuilder";
import { FuncOp } from "../../ir/core/FuncOp";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { AnalysisManager } from "../analysis/AnalysisManager";
import { AlgebraicSimplificationPass } from "../passes/AlgebraicSimplificationPass";
import { ExpressionInliningPass } from "../passes/ExpressionInliningPass";
import { CapturePruningPass } from "../passes/CapturePruningPass";
import { DeadCodeEliminationPass } from "../passes/DeadCodeEliminationPass";
import { ScalarReplacementOfAggregatesPass } from "../late-optimizer/passes/ScalarReplacementOfAggregatesPass";

interface OptimizerResult {
  changed: boolean;
}

export class Optimizer {
  constructor(
    private readonly funcOp: FuncOp,
    private readonly moduleIR: ModuleIR,
    private readonly _projectUnit: ProjectUnit,
    private readonly options: CompilerOptions,
    // oxlint-disable-next-line typescript/no-explicit-any
    private readonly _context: Map<string, any>,
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
          this.AM.invalidateFunction(this.funcOp);
        }
      };

      if (this.options.enableAlgebraicSimplificationPass) {
        runPass(new AlgebraicSimplificationPass(this.funcOp).run().changed);
      }

      if (this.options.enableExpressionInliningPass) {
        runPass(
          new ExpressionInliningPass(this.funcOp, this.moduleIR.environment, this.AM).run().changed,
        );
      }

      if (this.options.enableCapturePruningPass) {
        runPass(new CapturePruningPass(this.funcOp).run().changed);
      }

      if (this.options.enableDeadCodeEliminationPass) {
        runPass(
          new DeadCodeEliminationPass(this.funcOp, this.moduleIR.environment, this.AM).run()
            .changed,
        );
      }

      if (this.options.enableScalarReplacementOfAggregatesPass) {
        runPass(
          new ScalarReplacementOfAggregatesPass(
            this.funcOp,
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
