import { ModuleIRBuildResult } from "../frontend/ModuleIRBuilder";
import { AnalysisManager } from "../ir/analysis";
import { PromotableBindingsAnalysis } from "../ir/analysis/PromotableBinding";
import type { FunctionIR } from "../ir/core/FunctionIR";
import { IRIdAllocator } from "../ir/core/IRIdAllocator";
import type { ModuleIR } from "../ir/core/ModuleIR";
import { createConstantPropagationPass } from "../ir/passes/ConstantPropagationPass";
import { createCopyPropagationPass } from "../ir/passes/CopyPropagationPass";
import { createDeadCodeEliminationPass } from "../ir/passes/DeadCodeEliminationPass";
import { createDeadDeclarationEliminationPass } from "../ir/passes/DeadDeclarationEliminationPass";
import { createFunctionInliningPass } from "../ir/passes/FunctionInliningPass";
import type { FunctionPass } from "../ir/passes/Pass";
import { FunctionPassManager, ModulePassManager } from "../ir/passes/PassManager";
import { createSSAConstructionPass } from "../ir/passes/ssa/SSAConstructionPass";
import { createSSAEliminationPass } from "../ir/passes/ssa/SSAEliminationPass";
import { createValueMaterializationPass } from "../ir/passes/ValueMaterializationPass";

/**
 * Runs IR-to-IR compiler passes after frontend lowering.
 */
export function runCompilerPasses(buildResult: ModuleIRBuildResult, ids: IRIdAllocator) {
  const analyses = new AnalysisManager();
  const moduleIR = buildResult.moduleIR;

  runFunctionPipeline(moduleIR, analyses, () => [
    createSSAConstructionPass({ ids }),
    createConstantPropagationPass({ ids }),
  ]);

  new ModulePassManager(analyses).run(moduleIR, [
    createFunctionInliningPass({ ids }),
    createDeadDeclarationEliminationPass(),
  ]);

  runFunctionPipeline(moduleIR, analyses, (fn) => {
    const promotable = analyses.getFunction(PromotableBindingsAnalysis, fn);

    return [
      createSSAEliminationPass({
        ids,
        declarations: [...promotable.declarations],
      }),
      createValueMaterializationPass({ ids }),
      createCopyPropagationPass(),
      createDeadCodeEliminationPass(),
    ];
  });

  return buildResult;
}

function runFunctionPipeline(
  moduleIR: ModuleIR,
  analyses: AnalysisManager,
  passesFor: (fn: FunctionIR) => readonly FunctionPass[],
): void {
  for (const fn of [...moduleIR.functions]) {
    new FunctionPassManager(analyses).run(fn, passesFor(fn));
  }
}
