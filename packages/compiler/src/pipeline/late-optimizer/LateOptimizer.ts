import { CompilerOptions } from "../../compile";
import { BasicBlock, BlockId } from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { AnalysisManager } from "../analysis/AnalysisManager";
import { LateCopyPropagationPass } from "./passes/LateCopyPropagationPass";
import { LateDeadCodeEliminationPass } from "./passes/LateDeadCodeEliminationPass";
import { LateDeadStoreEliminationPass } from "./passes/LateDeadStoreEliminationPass";

interface LateOptimizerResult {
  blocks: Map<BlockId, BasicBlock>;
}

/**
 * Post-SSA cleanup optimizer.
 *
 * Runs after SSA elimination to clean up artifacts (redundant copies,
 * dead stores, load-store chains) introduced by phi elimination.
 * Passes run in a fixpoint loop until no pass reports changes.
 *
 * ExportDeclarationMerging is NOT part of this optimizer — it is a
 * lowering concern and runs separately in the pipeline.
 */
export class LateOptimizer {
  constructor(
    private readonly moduleIR: ModuleIR,
    private readonly functionIR: FunctionIR,
    private readonly options: CompilerOptions,
    private readonly AM: AnalysisManager,
  ) {}

  public run(): LateOptimizerResult {
    let blocks = this.functionIR.blocks;
    let changed = true;

    while (changed) {
      changed = false;

      if (this.options.enableLateCopyPropagationPass) {
        const copyPropagationResult = new LateCopyPropagationPass(this.functionIR).run();
        if (copyPropagationResult.changed) {
          changed = true;
          this.AM.invalidateFunction(this.functionIR);
        }
        blocks = copyPropagationResult.blocks;
      }

      if (this.options.enableLateDeadStoreEliminationPass) {
        const deadStoreEliminationResult = new LateDeadStoreEliminationPass(
          this.functionIR,
        ).run();
        if (deadStoreEliminationResult.changed) {
          changed = true;
          this.AM.invalidateFunction(this.functionIR);
        }
        blocks = deadStoreEliminationResult.blocks;
      }

      if (this.options.enableLateDeadCodeEliminationPass) {
        const lateDeadCodeEliminationResult = new LateDeadCodeEliminationPass(
          this.functionIR,
          this.moduleIR.environment,
          this.AM,
        ).run();
        if (lateDeadCodeEliminationResult.changed) {
          changed = true;
          this.AM.invalidateFunction(this.functionIR);
        }
        blocks = lateDeadCodeEliminationResult.blocks;
      }
    }

    return { blocks };
  }
}
