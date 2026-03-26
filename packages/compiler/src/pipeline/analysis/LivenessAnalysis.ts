import { IdentifierId } from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { FunctionAnalysis, AnalysisManager } from "./AnalysisManager";

/**
 * The result of liveness analysis: the set of identifiers that are
 * live (transitively used) in the function.
 *
 * An identifier is live if:
 * 1. It is directly read by an instruction, terminal, or structure, OR
 * 2. It is an operand of a phi whose result is live, OR
 * 3. It is read by a structure that is live (has side effects or a
 *    written place that is live).
 */
export class LivenessResult {
  constructor(private readonly liveIds: ReadonlySet<IdentifierId>) {}

  /** Returns true if this identifier is live. */
  isLive(id: IdentifierId): boolean {
    return this.liveIds.has(id);
  }
}

/**
 * Computes transitive liveness for a single function.
 *
 * Starts from the directly-used identifiers (instructions and terminals
 * that read places) and propagates liveness through:
 * - **Phi operands**: if a phi's result is live, all its operands are live.
 * - **Structures**: if a structure has side effects or any written place
 *   is live, all its read places are live.
 *
 * Propagation runs to fixpoint to handle chains (phi→phi, structure→phi,
 * etc.).
 *
 * Reads phis from `functionIR.phis` (set by SSABuilder). For post-SSA
 * usage (where phis have been eliminated), the simpler
 * DefUseAnalysis.isUsed() is sufficient.
 *
 * Usage:
 * ```ts
 * const liveness = AM.get(LivenessAnalysis, functionIR);
 * if (!liveness.isLive(id)) {
 *   // safe to remove the instruction that defines id
 * }
 * ```
 */
export class LivenessAnalysis extends FunctionAnalysis<LivenessResult> {
  run(functionIR: FunctionIR, _AM: AnalysisManager): LivenessResult {
    // Seed: every identifier directly read by an instruction or terminal.
    const liveIds = new Set<IdentifierId>();
    for (const block of functionIR.blocks.values()) {
      for (const instr of block.instructions) {
        for (const place of instr.getReadPlaces()) {
          liveIds.add(place.identifier.id);
        }
      }
      if (block.terminal) {
        for (const place of block.terminal.getReadPlaces()) {
          liveIds.add(place.identifier.id);
        }
      }
    }

    // Propagate through phis and structures to fixpoint.
    let changed = true;
    while (changed) {
      changed = false;

      // Phi propagation: if a phi's result is live, its operands are live.
      for (const phi of functionIR.phis) {
        if (!liveIds.has(phi.place.identifier.id)) continue;
        for (const [, place] of phi.operands) {
          if (!liveIds.has(place.identifier.id)) {
            liveIds.add(place.identifier.id);
            changed = true;
          }
        }
      }

      // Structure propagation: if a structure is live, its reads are live.
      for (const structure of functionIR.structures.values()) {
        const isLive =
          structure.hasSideEffects() ||
          structure.getWrittenPlaces().some((p) => liveIds.has(p.identifier.id));
        if (isLive) {
          for (const place of structure.getReadPlaces()) {
            if (!liveIds.has(place.identifier.id)) {
              liveIds.add(place.identifier.id);
              changed = true;
            }
          }
        }
      }
    }

    return new LivenessResult(liveIds);
  }
}
