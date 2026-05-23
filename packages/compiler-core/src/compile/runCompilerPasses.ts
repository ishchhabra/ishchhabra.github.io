import { ModuleIRBuildResult } from "../frontend/ModuleIRBuilder";
import { AnalysisManager } from "../ir/analysis";
import type { FunctionIR } from "../ir/core/FunctionIR";
import { IRIdAllocator } from "../ir/core/IRIdAllocator";
import type { ModuleIR } from "../ir/core/ModuleIR";
import { createBindingPromotionPass } from "../ir/passes/BindingPromotionPass";
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
import type { CompilerObserver } from "./CompilerObserver";

export interface RunCompilerPassesOptions {
  readonly observer?: CompilerObserver;
}

/**
 * Runs IR-to-IR compiler passes after frontend lowering.
 */
export function runCompilerPasses(
  buildResult: ModuleIRBuildResult,
  ids: IRIdAllocator,
  options: RunCompilerPassesOptions = {},
) {
  const analyses = new AnalysisManager();
  const moduleIR = buildResult.moduleIR;

  runFunctionPipeline(moduleIR, analyses, options.observer, () => [
    createSSAConstructionPass({ ids }),
    createBindingPromotionPass({ declarations: buildResult.declarations }),
    createConstantPropagationPass({ ids }),
  ]);
  options.observer?.onStage?.({ stage: "ssa", moduleIR });

  new ModulePassManager(analyses, options.observer).run(moduleIR, [
    createFunctionInliningPass({ ids }),
    createDeadDeclarationEliminationPass(),
  ]);
  options.observer?.onStage?.({ stage: "optimized", moduleIR });

  runFunctionPipeline(moduleIR, analyses, options.observer, () => [
    createSSAEliminationPass({ ids }),
  ]);
  options.observer?.onStage?.({ stage: "ssa-eliminated", moduleIR });

  runFunctionPipeline(moduleIR, analyses, options.observer, () => [
    createValueMaterializationPass({ ids, declarations: buildResult.declarations }),
    createCopyPropagationPass(),
    createDeadCodeEliminationPass(),
  ]);
  options.observer?.onStage?.({ stage: "late-optimized", moduleIR });

  return buildResult;
}

function runFunctionPipeline(
  moduleIR: ModuleIR,
  analyses: AnalysisManager,
  observer: CompilerObserver | undefined,
  passesFor: (fn: FunctionIR) => readonly FunctionPass[],
): void {
  for (const fn of Array.from(moduleIR.functions)) {
    try {
      new FunctionPassManager(analyses, observer).run(fn, passesFor(fn));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Function#${fn.id} (${fn.kind}) failed: ${message}`);
    }
  }
}
