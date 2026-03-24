import { CompilerOptions } from "../../compile";
import { BasicBlock, BlockId } from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { LateCopyPropagationPass } from "./passes/LateCopyPropagationPass";
import { LateDeadCodeEliminationPass } from "./passes/LateDeadCodeEliminationPass";
import { LoadStoreForwardingPass } from "./passes/LoadStoreForwardingPass";
import { RedundantCopyEliminationPass } from "./passes/RedundantCopyEliminationPass";

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
  ) {}

  public run(): LateOptimizerResult {
    let blocks = this.functionIR.blocks;
    let changed = true;

    while (changed) {
      changed = false;

      if (this.options.enableLoadStoreForwardingPass) {
        const loadStoreForwardingResult = new LoadStoreForwardingPass(this.functionIR).run();
        changed ||= loadStoreForwardingResult.changed;
        blocks = loadStoreForwardingResult.blocks;
      }

      if (this.options.enableLateCopyPropagationPass) {
        const copyPropagationResult = new LateCopyPropagationPass(this.functionIR).run();
        changed ||= copyPropagationResult.changed;
        blocks = copyPropagationResult.blocks;
      }

      if (this.options.enableRedundantCopyEliminationPass) {
        const redundantStoreEliminationResult = new RedundantCopyEliminationPass(
          this.functionIR,
        ).run();
        changed ||= redundantStoreEliminationResult.changed;
        blocks = redundantStoreEliminationResult.blocks;
      }

      if (this.options.enableLateDeadCodeEliminationPass) {
        const lateDeadCodeEliminationResult = new LateDeadCodeEliminationPass(
          this.functionIR,
          this.moduleIR.environment,
        ).run();
        changed ||= lateDeadCodeEliminationResult.changed;
        blocks = lateDeadCodeEliminationResult.blocks;
      }
    }

    return { blocks };
  }
}
