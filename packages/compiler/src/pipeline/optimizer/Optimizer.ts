import { CompilerOptions } from "../../compile";
import { FuncOp } from "../../ir/core/FuncOp";
import { AnalysisManager } from "../analysis/AnalysisManager";
import type { PipelineObserver } from "../Observer";
import { FunctionPassManager, funcPass, type FunctionPass } from "../PassManager";
import { ProjectUnit } from "../../frontend/ProjectBuilder";
import { AlgebraicSimplificationPass } from "../passes/AlgebraicSimplificationPass";
import { CapturePruningPass } from "../passes/CapturePruningPass";
import { ConstantPropagationPass } from "../passes/ConstantPropagationPass";
import { DeadCodeEliminationPass } from "../passes/DeadCodeEliminationPass";
import { ExpressionInliningPass } from "../passes/ExpressionInliningPass";
import { ReassociationPass } from "../passes/ReassociationPass";
import { ScalarReplacementOfAggregatesPass } from "../late-optimizer/passes/ScalarReplacementOfAggregatesPass";

interface OptimizerResult {
  changed: boolean;
}

/**
 * Pre-SSA-elimination function-level optimizer.
 *
 * LLVM-style **scripted pipeline**: the pass list itself encodes the
 * ordering and reinvocations. Each entry executes exactly once, in
 * list order, via {@link FunctionPassManager.runOnce}. No outer
 * fixpoint — cascades are caught by placing cheap cleanup passes
 * (DCE, AlgebraicSimplification) after anything that creates dead
 * code, then again at the end as a final mop-up.
 *
 * Structure:
 *
 *   1. Cheap canonicalization + forwarding.
 *   2. DCE to remove exposed deads.
 *   3. The one heavy transform (SROA).
 *   4. Re-canonicalize + re-forward to propagate SROA results.
 *   5. CapturePruning once closures have been inlined.
 *   6. Final DCE.
 */
export class Optimizer {
  constructor(
    private readonly funcOp: FuncOp,
    private readonly projectUnit: ProjectUnit,
    private readonly options: CompilerOptions,
    private readonly AM: AnalysisManager,
    private readonly observer?: PipelineObserver,
  ) {}

  public run(): OptimizerResult {
    const o = this.options;

    // Individual pass wrappers (allocated once, reused in the script below).
    const algebraicSimp = funcPass(
      "algebraic-simplification",
      (f, am) => new AlgebraicSimplificationPass(f, am),
    );
    const constantPropagation = funcPass(
      "constant-propagation",
      (f) => new ConstantPropagationPass(f, f.moduleIR, this.projectUnit, this.options),
    );
    const reassociation = funcPass("reassociation", (f) => new ReassociationPass(f));
    const expressionInlining = funcPass(
      "expression-inlining",
      (f, am) => new ExpressionInliningPass(f, f.moduleIR.environment, am),
    );
    const dce = funcPass(
      "dead-code-elimination",
      (f, am) => new DeadCodeEliminationPass(f, f.moduleIR.environment, am),
    );
    const sroa = funcPass(
      "scalar-replacement-of-aggregates",
      (f, am) => new ScalarReplacementOfAggregatesPass(f, f.moduleIR.environment, am),
    );
    const capturePruning = funcPass("capture-pruning", (f) => new CapturePruningPass(f));

    // Gate each entry on its enable flag. Disabled passes drop out of
    // the script entirely — order and reinvocations of the remaining
    // passes are preserved. The second [AlgSimp → ExprInlining → DCE]
    // cycle after SROA mirrors LLVM's pattern: SROA creates new
    // forwarding opportunities (store-to-load), which in turn make
    // objects single-use, which inlining can then fold into their use
    // site. One post-SROA cleanup catches the first layer; the second
    // cleanup catches cascades the first exposed.
    const script: FunctionPass[] = [];
    if (o.enableAlgebraicSimplificationPass) script.push(algebraicSimp);
    if (o.enableReassociationPass) script.push(reassociation);
    if (o.enableConstantPropagationPass) script.push(constantPropagation);
    if (o.enableExpressionInliningPass) script.push(expressionInlining);
    if (o.enableDeadCodeEliminationPass) script.push(dce);
    if (o.enableScalarReplacementOfAggregatesPass) script.push(sroa);
    if (o.enableAlgebraicSimplificationPass) script.push(algebraicSimp);
    if (o.enableReassociationPass) script.push(reassociation);
    if (o.enableConstantPropagationPass) script.push(constantPropagation);
    if (o.enableExpressionInliningPass) script.push(expressionInlining);
    if (o.enableDeadCodeEliminationPass) script.push(dce);
    if (o.enableAlgebraicSimplificationPass) script.push(algebraicSimp);
    if (o.enableExpressionInliningPass) script.push(expressionInlining);
    if (o.enableCapturePruningPass) script.push(capturePruning);
    if (o.enableDeadCodeEliminationPass) script.push(dce);

    return new FunctionPassManager(this.AM, this.observer).runOnce(this.funcOp, script);
  }
}
