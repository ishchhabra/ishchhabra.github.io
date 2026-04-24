import { Environment } from "../../environment";
import { FuncOp } from "../../ir/core/FuncOp";
import { Operation, Trait } from "../../ir/core/Operation";
import { AnalysisManager } from "../analysis/AnalysisManager";
import { LivenessAnalysis, LivenessResult } from "../analysis/LivenessAnalysis";
import { BaseOptimizationPass, OptimizationResult } from "../late-optimizer/OptimizationPass";
import { Edge, forEachIncomingEdge, forEachOutgoingEdge } from "../ssa/blockArgs";

/**
 * SSA-phase Dead Code Elimination.
 *
 * Uniform walk over every op in every block's `_ops` — structured
 * ops, instructions, terminators alike. Removes ops whose results
 * are not live.
 *
 * Block-param shrinking works through the uniform edge API
 * ({@link forEachIncomingEdge} / {@link Edge.apply}) so it's
 * agnostic to whether the edges come from `JumpTermOp`s or structured-op
 * ports. Blocks whose params receive values from structured-op
 * virtual edges (iter-arg region entries, if-arm yields) are left
 * alone here — their params are positionally bound to multi-slot
 * port bundles (`WhileOp.inits` ↔ before-region params ↔
 * `ConditionTermOp.args` ↔ body-region params ↔ yield values ↔
 * `resultPlaces`) that must shrink together. That synchronized
 * shrink is an op-canonicalization concern, not a generic-DCE one —
 * MLIR draws the same line.
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
    for (const p of op.results()) {
      if (liveness.isLive(p.id)) return true;
    }
    return false;
  }

  private removeDeadBlockParams(liveness: LivenessResult): boolean {
    let changed = false;

    for (const block of this.funcOp.allBlocks()) {
      if (block.params.length === 0) continue;
      if (this.hasStructuredOpIncomingEdge(block)) continue;

      const mask = block.params.map((p) => liveness.isLive(p.id));
      if (mask.every((live) => live)) continue;

      block.params = block.params.filter((_, i) => mask[i]);
      changed = true;

      // Rewrite every incoming edge's args to the new mask via the
      // uniform edge API. Works for any edge kind.
      forEachIncomingEdge(this.funcOp, { kind: "block", block }, (edge: Edge) => {
        edge.apply(edge.args.filter((_, i) => mask[i]));
      });
    }

    return changed;
  }

  /**
   * True if any incoming edge to `block` originates from a
   * structured-op virtual terminator (ConditionTermOp / YieldTermOp) or an
   * op-entry port (WhileOp.inits). Such blocks belong to an iter-arg
   * bundle and shouldn't be shrunk by generic DCE.
   */
  private hasStructuredOpIncomingEdge(block: import("../../ir/core/Block").BasicBlock): boolean {
    let flagged = false;
    for (const predBlock of this.funcOp.allBlocks()) {
      forEachOutgoingEdge(this.funcOp, predBlock, (edge) => {
        if (flagged) return;
        if (edge.sink.kind !== "block" || edge.sink.block !== block) return;
        const term = predBlock.terminal;
        const isJump = term !== undefined && term.constructor.name === "JumpTermOp";
        if (!isJump) flagged = true;
      });
      if (flagged) break;
    }
    return flagged;
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
        if (op.results().some((p) => liveness.isLive(p.id))) continue;
        block.removeOpAt(i);
        changed = true;
      }
    }

    return changed;
  }
}
