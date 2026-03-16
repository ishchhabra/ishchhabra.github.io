import {
  FunctionDeclarationInstruction,
  IdentifierId,
  StoreLocalInstruction,
} from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { DefMap } from "../analysis/DefMap";
import { BaseOptimizationPass, OptimizationResult } from "../late-optimizer/OptimizationPass";
import { Phi } from "../ssa/Phi";

/**
 * SSA-phase Dead Code Elimination.
 *
 * Removes pure instructions whose defined place has no readers anywhere
 * in the function. Because the IR is in SSA form, each place has exactly
 * one definition, so an instruction is dead when its place's identifier
 * never appears in any other instruction's read set.
 *
 * Algorithm:
 *   1. Collect all identifiers that are **read** by any instruction or
 *      terminal across every block.
 *   2. Propagate liveness through phi nodes to fixpoint: for each phi
 *      whose result is used, mark its operands as used. Repeat until
 *      stable, since phi operands may themselves be other phi results
 *      (nested control flow).
 *   3. Walk every block and remove pure instructions whose defined
 *      identifier is not in the read set.
 *   4. For StoreLocal, the instruction is dead when its lval is not read
 *      — unless its value is produced by an impure instruction, in which
 *      case the StoreLocal must be kept to anchor the side effect to the
 *      codegen output.
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

    // 3. Remove pure instructions that define an unused identifier.
    for (const block of this.functionIR.blocks.values()) {
      const before = block.instructions.length;
      block.instructions = block.instructions.filter((instr) => {
        if (!instr.isPure) {
          return true;
        }

        // FunctionDeclaration defines a binding via `identifier`, not `place`.
        if (instr instanceof FunctionDeclarationInstruction) {
          return usedIds.has(instr.identifier.identifier.id);
        }

        if (instr instanceof StoreLocalInstruction) {
          if (usedIds.has(instr.lval.identifier.id)) {
            return true;
          }

          // If the value is produced by an impure instruction, keep the
          // StoreLocal to anchor the side effect to the codegen output.
          if (defs.isImpure(instr.value.identifier.id)) {
            return true;
          }

          return false;
        }

        return usedIds.has(instr.place.identifier.id);
      });

      if (block.instructions.length !== before) {
        changed = true;
      }
    }

    return { changed };
  }
}
