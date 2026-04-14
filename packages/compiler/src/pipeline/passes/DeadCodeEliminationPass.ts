import { Environment } from "../../environment";
import type { BlockId } from "../../ir";
import { FuncOp } from "../../ir/core/FuncOp";
import { Operation, Trait } from "../../ir/core/Operation";
import type { Place } from "../../ir/core/Place";
import { AnalysisManager } from "../analysis/AnalysisManager";
import { LivenessAnalysis, LivenessResult } from "../analysis/LivenessAnalysis";
import { BaseOptimizationPass, OptimizationResult } from "../late-optimizer/OptimizationPass";
import { rewriteOutgoingEdgeArgs } from "../ssa/blockArgs";

/**
 * SSA-phase Dead Code Elimination.
 *
 * Uniform walk over every op in every block's `_ops` — structured
 * ops, instructions, terminators alike. Removes ops whose results
 * are not live.
 */
export class DeadCodeEliminationPass extends BaseOptimizationPass {
  constructor(
    protected readonly funcOp: FuncOp,
    private readonly environment: Environment,
    private readonly AM: AnalysisManager,
  ) {
    super(funcOp);
  }

  protected step(): OptimizationResult {
    const liveness = this.AM.get(LivenessAnalysis, this.funcOp);

    const removedParams = this.removeDeadBlockParams(liveness);
    const removedInstructions = this.removeDeadInstructions(liveness);

    const changed = removedParams || removedInstructions;
    if (changed) {
      this.AM.invalidateFunction(this.funcOp);
    }

    return { changed };
  }

  /**
   * A structured op is live iff any def anywhere inside its regions
   * is live — including result places, nested op defs, and contained
   * block params. Walking the full region tree keeps loop-carried
   * mutations alive even when the op itself has no outer defs.
   */
  private structureHasLiveDef(op: Operation, liveness: LivenessResult): boolean {
    for (const p of op.getDefs()) {
      if (liveness.isLive(p.identifier.id)) return true;
    }
    for (const region of op.regions) {
      for (const block of region.blocks) {
        for (const param of block.params) {
          if (liveness.isLive(param.identifier.id)) return true;
        }
        for (const innerOp of block.operations) {
          for (const p of innerOp.getDefs()) {
            if (liveness.isLive(p.identifier.id)) return true;
          }
          if (innerOp.hasTrait(Trait.HasRegions)) {
            if (this.structureHasLiveDef(innerOp, liveness)) return true;
          }
        }
      }
    }
    return false;
  }

  private removeDeadBlockParams(liveness: LivenessResult): boolean {
    let changed = false;

    const keepMask = new Map<BlockId, boolean[]>();
    for (const block of this.funcOp.allBlocks()) {
      if (block.params.length === 0) continue;
      const mask = block.params.map((p) => liveness.isLive(p.identifier.id));
      if (mask.every((live) => live)) continue;
      keepMask.set(block.id, mask);
      block.params = block.params.filter((_, i) => mask[i]);
      changed = true;
    }
    if (!changed) return false;

    for (const predBlock of this.funcOp.allBlocks()) {
      if (predBlock.terminal === undefined) continue;
      let terminal = predBlock.terminal;
      for (const [succId, mask] of keepMask) {
        terminal = rewriteOutgoingEdgeArgs(terminal, succId, (args: readonly Place[]) =>
          args.filter((_, i) => mask[i]),
        );
      }
      if (terminal !== predBlock.terminal) {
        predBlock.replaceTerminal(terminal);
      }
    }

    return true;
  }

  private removeDeadInstructions(liveness: LivenessResult): boolean {
    let changed = false;

    for (const block of this.funcOp.allBlocks()) {
      for (let i = block.operations.length - 1; i >= 0; i--) {
        const op = block.operations[i];
        if (op.hasTrait(Trait.HasRegions)) {
          if (op.hasSideEffects(this.environment)) continue;
          if (this.structureHasLiveDef(op, liveness)) continue;
          block.removeOpAt(i);
          changed = true;
          continue;
        }
        if (op.hasSideEffects(this.environment)) continue;
        if (op.getDefs().some((p) => liveness.isLive(p.identifier.id))) continue;
        block.removeOpAt(i);
        changed = true;
      }
    }

    return changed;
  }
}
