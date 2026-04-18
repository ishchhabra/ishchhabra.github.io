import { CompilerOptions } from "../../compile";
import { FuncOp } from "../../ir/core/FuncOp";
import { AnalysisManager } from "../analysis/AnalysisManager";
import type { PipelineObserver } from "../Observer";
import { FunctionPassManager, funcPass, type FunctionPass } from "../PassManager";
import { LateConstantPropagationPass } from "./passes/LateConstantPropagationPass";
import { LateCopyPropagationPass } from "./passes/LateCopyPropagationPass";
import { LateDeadCodeEliminationPass } from "./passes/LateDeadCodeEliminationPass";

interface LateOptimizerResult {
  changed: boolean;
}

/**
 * Post-SSA cleanup optimizer. Runs after SSA elimination to clean
 * up artifacts (redundant copies, dead stores, load-store chains)
 * introduced by phi destruction.
 *
 * LLVM-style **scripted pipeline**: two cycles of the classic
 * constant-prop / copy-prop / DCE trio, mirroring LLVM's pattern of
 * re-scheduling cheap cleanup passes at stage boundaries. Copy
 * propagation exposes new constant-propagation opportunities (a
 * variable whose only uses are now constants), and vice versa, so
 * two cycles are enough to catch the typical cascade.
 *
 * ExportDeclarationMerging is NOT part of this optimizer — it is a
 * lowering concern and runs separately in the pipeline.
 */
export class LateOptimizer {
  constructor(
    private readonly funcOp: FuncOp,
    private readonly options: CompilerOptions,
    private readonly AM: AnalysisManager,
    private readonly observer?: PipelineObserver,
  ) {}

  public run(): LateOptimizerResult {
    const o = this.options;

    const lateConstProp = funcPass(
      "late-constant-propagation",
      (f) => new LateConstantPropagationPass(f),
    );
    const lateCopyProp = funcPass("late-copy-propagation", (f) => new LateCopyPropagationPass(f));
    const lateDce = funcPass(
      "late-dead-code-elimination",
      (f) => new LateDeadCodeEliminationPass(f, f.moduleIR.environment),
    );

    // Two cycles of const-prop → copy-prop → DCE.
    const script: FunctionPass[] = [];
    for (let i = 0; i < 2; i++) {
      if (o.enableLateConstantPropagationPass) script.push(lateConstProp);
      if (o.enableLateCopyPropagationPass) script.push(lateCopyProp);
      if (o.enableLateDeadCodeEliminationPass) script.push(lateDce);
    }

    return new FunctionPassManager(this.AM, this.observer).runOnce(this.funcOp, script);
  }
}
