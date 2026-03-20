import { BaseInstruction, IdentifierId } from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { DefMap } from "../analysis/DefMap";
import { BaseOptimizationPass, OptimizationResult } from "../late-optimizer/OptimizationPass";
import { Phi } from "../ssa/Phi";

/**
 * SSA-phase Dead Code Elimination.
 *
 * Removes instructions whose defined places have no readers anywhere
 * in the function. Because the IR is in SSA form, each place has exactly
 * one definition, so an instruction is dead when none of its written
 * places' identifiers appear in any other instruction's read set.
 *
 * Algorithm:
 *   1. Collect all identifiers that are **read** by any instruction or
 *      terminal across every block.
 *   2. Propagate liveness through phi nodes to fixpoint: for each phi
 *      whose result is used, mark its operands as used. Repeat until
 *      stable, since phi operands may themselves be other phi results
 *      (nested control flow).
 *   2b. Remove dead phis from `phis`: if a phi's result is unused, delete
 *      it so SSA elimination never emits loads from operand defs that DCE
 *      may remove (dead merge / unused variable).
 *   3. Walk every block and remove instructions that have no side effects
 *      and whose written places are all unused. Dead instructions that
 *      wrap a side-effecting value (e.g. `StoreLocal result = delete obj.x`)
 *      are replaced via `asSideEffect()` to preserve the side effect as
 *      an expression statement.
 *
 * The base class re-runs `step()` until fixpoint so that chains of dead
 * instructions (e.g. `a = 1; b = a;` where only `b` is dead initially)
 * are cleaned up across iterations.
 */
export class DeadCodeEliminationPass extends BaseOptimizationPass {
  constructor(
    protected readonly functionIR: FunctionIR,
    private readonly phis: Set<Phi>,
  ) {
    super(functionIR);
  }

  protected step(): OptimizationResult {
    let changed = false;
    const defs = new DefMap(this.functionIR);

    // 1. Collect every identifier that is *read* by any instruction or terminal.
    const usedIds = new Set<IdentifierId>();

    for (const block of this.functionIR.blocks.values()) {
      for (const instr of block.instructions) {
        for (const place of instr.getReadPlaces()) {
          usedIds.add(place.identifier.id);
        }
      }
      if (block.terminal) {
        for (const place of block.terminal.getReadPlaces()) {
          usedIds.add(place.identifier.id);
        }
      }
    }

    // Mark places read and written by structures as used.
    for (const structure of this.functionIR.structures.values()) {
      for (const place of structure.getReadPlaces()) {
        usedIds.add(place.identifier.id);
      }
      for (const place of structure.getWrittenPlaces()) {
        usedIds.add(place.identifier.id);
      }
    }

    // 2. Propagate liveness through phi operands to fixpoint. A phi is
    //    live when its result place is used. Its operands may be other phi
    //    results (nested control flow), so we iterate until no new ids are
    //    added to handle chains like phi_A → phi_B → phi_C.
    let phiChanged = true;
    while (phiChanged) {
      phiChanged = false;
      for (const phi of this.phis) {
        if (!usedIds.has(phi.place.identifier.id)) {
          continue;
        }
        for (const [, place] of phi.operands) {
          if (!usedIds.has(place.identifier.id)) {
            usedIds.add(place.identifier.id);
            phiChanged = true;
          }
        }
      }
    }

    // 2b. Drop phis whose result is never used — keeps SSAEliminator consistent
    //     with instruction DCE (operand defs may be removed below).
    const deadPhis: Phi[] = [];
    for (const phi of this.phis) {
      if (!usedIds.has(phi.place.identifier.id)) {
        deadPhis.push(phi);
      }
    }
    if (deadPhis.length > 0) {
      for (const phi of deadPhis) {
        this.phis.delete(phi);
      }
      changed = true;
    }

    // 3. Remove dead instructions, preserving side effects via asSideEffect().
    for (const block of this.functionIR.blocks.values()) {
      const before = block.instructions.length;
      block.instructions = block.instructions.flatMap((instr): BaseInstruction[] => {
        // Side-effecting instructions are always live.
        if (instr.hasSideEffects) {
          return [instr];
        }

        // Keep the instruction if any of its written places are used.
        if (instr.getWrittenPlaces().some((place) => usedIds.has(place.identifier.id))) {
          return [instr];
        }

        // The instruction is dead. If it wraps a side-effecting value,
        // replace it with a side-effect-only form to preserve the effect.
        const replacement = instr.asSideEffect();
        if (replacement && defs.hasSideEffects(replacement)) {
          return [replacement];
        }

        // Truly dead — remove entirely.
        return [];
      });

      if (block.instructions.length !== before) {
        changed = true;
      }
    }

    return { changed };
  }
}
