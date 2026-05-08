import { ModuleIRBuildResult } from "../frontend/ModuleIRBuilder";
import { AnalysisManager } from "../ir/analysis";
import { PromotableBindingsAnalysis } from "../ir/analysis/PromotableBinding";
import { IRIdAllocator } from "../ir/core/IRIdAllocator";
import { createCopyPropagationPass } from "../ir/passes/CopyPropagationPass";
import { createDeadCodeEliminationPass } from "../ir/passes/DeadCodeEliminationPass";
import { FunctionPassManager } from "../ir/passes/PassManager";
import { createSSAConstructionPass } from "../ir/passes/ssa/SSAConstructionPass";
import { createSSAEliminationPass } from "../ir/passes/ssa/SSAEliminationPass";
import { createValueMaterializationPass } from "../ir/passes/ValueMaterializationPass";

/**
 * Runs IR-to-IR compiler passes after frontend lowering.
 */
export function runCompilerPasses(
  buildResult: ModuleIRBuildResult,
  ids: IRIdAllocator,
) {
  const analyses = new AnalysisManager();
  const functions = [...buildResult.moduleIR.functions];

  for (const fn of functions) {
    const promotable = analyses.getFunction(PromotableBindingsAnalysis, fn);

    new FunctionPassManager(analyses).run(fn, [
      createSSAConstructionPass({ ids }),
      createSSAEliminationPass({
        ids,
        declarations: [...promotable.declarations],
      }),
      createValueMaterializationPass({ ids }),
      createCopyPropagationPass(),
      createDeadCodeEliminationPass(),
    ]);
  }

  return buildResult;
}
