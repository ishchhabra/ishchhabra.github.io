import { Environment } from "../../../environment";
import { FunctionDeclarationInstruction, IdentifierId, StoreLocalInstruction } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { DefMap } from "../../analysis/DefMap";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";

/**
 * Late Dead Code Elimination — cleanup pass after SSA elimination.
 *
 * Removes pure instructions whose defined place has no readers. This pass
 * exists to clean up dead code introduced by SSA elimination (copies,
 * phi declarations) and by earlier late passes (copy propagation,
 * redundant copy elimination).
 *
 * The heavy lifting is done by the SSA-phase DCE. This pass only handles
 * post-SSA artifacts and pattern-aware StoreLocal elimination.
 *
 * The base class re-runs `step()` until fixpoint so that chains of dead
 * instructions are cleaned up across iterations.
 */
export class LateDeadCodeEliminationPass extends BaseOptimizationPass {
  constructor(
    protected readonly functionIR: FunctionIR,
    private readonly environment: Environment,
  ) {
    super(functionIR);
  }

  protected step(): OptimizationResult {
    let changed = false;
    const defs = new DefMap(this.functionIR, this.environment);

    // 1. Collect every identifier read by any instruction or terminal.
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

    // 2. Remove pure instructions that define an unused identifier.
    for (const block of this.functionIR.blocks.values()) {
      const before = block.instructions.length;
      block.instructions = block.instructions.filter((instr) => {
        if (!instr.isPure(this.environment)) {
          return true;
        }

        if (instr instanceof FunctionDeclarationInstruction) {
          return usedIds.has(instr.identifier.identifier.id);
        }

        if (instr instanceof StoreLocalInstruction) {
          if (instr.getWrittenPlaces().some((place) => usedIds.has(place.identifier.id))) {
            return true;
          }

          // If the value is produced by an impure instruction, keep the
          // store to anchor the side effect to the codegen output.
          if (defs.isImpure(instr.value.identifier.id)) {
            return true;
          }

          return false;
        }

        return instr.getWrittenPlaces().some((place) => usedIds.has(place.identifier.id));
      });

      if (block.instructions.length !== before) {
        changed = true;
      }
    }

    return { changed };
  }
}
