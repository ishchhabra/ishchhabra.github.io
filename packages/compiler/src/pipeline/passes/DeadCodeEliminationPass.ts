import { Environment } from "../../environment";
import { BaseInstruction, IdentifierId } from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { BaseOptimizationPass, OptimizationResult } from "../late-optimizer/OptimizationPass";
import { Phi } from "../ssa/Phi";

/**
 * SSA-phase Dead Code Elimination.
 *
 * Removes instructions, phis, and structures whose results have no
 * readers anywhere in the function. Because the IR is in SSA form,
 * each place has exactly one definition, so a definition is dead when
 * its identifier never appears in another definition's read set.
 *
 * Algorithm:
 *   1. Collect all identifiers **read** by instructions, terminals,
 *      and live structures.
 *   2. Propagate liveness through phi operands to fixpoint.
 *   3. Remove dead structures, phis, and instructions.
 *
 * The base class re-runs `step()` until fixpoint so that chains of
 * dead definitions are cleaned up across iterations.
 */
export class DeadCodeEliminationPass extends BaseOptimizationPass {
  constructor(
    protected readonly functionIR: FunctionIR,
    private readonly phis: Set<Phi>,
    private readonly environment: Environment,
  ) {
    super(functionIR);
  }

  protected step(): OptimizationResult {
    const usedIds = this.collectUsedIds();
    this.propagateLiveness(usedIds);

    const removedStructures = this.removeDeadStructures(usedIds);
    const removedPhis = this.removeDeadPhis(usedIds);
    const removedInstructions = this.removeDeadInstructions(usedIds);

    return { changed: removedStructures || removedPhis || removedInstructions };
  }

  /**
   * Collects every identifier that is read by any instruction or
   * terminal across all blocks.
   */
  private collectUsedIds(): Set<IdentifierId> {
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

    return usedIds;
  }

  /**
   * Propagates liveness through phis and structures to fixpoint.
   *
   * A phi is live when its result is used; its operands then become
   * used. A structure is live when it has side effects or any written
   * place is used; its reads then become used. Both can form chains
   * (phi→phi, structure→structure, phi→structure, structure→phi),
   * so they're handled in a single fixpoint loop.
   */
  private propagateLiveness(usedIds: Set<IdentifierId>): void {
    let changed = true;
    while (changed) {
      changed = false;

      for (const phi of this.phis) {
        if (!usedIds.has(phi.place.identifier.id)) continue;
        for (const [, place] of phi.operands) {
          if (!usedIds.has(place.identifier.id)) {
            usedIds.add(place.identifier.id);
            changed = true;
          }
        }
      }

      for (const structure of this.functionIR.structures.values()) {
        const isLive =
          structure.hasSideEffects() ||
          structure.getWrittenPlaces().some((p) => usedIds.has(p.identifier.id));
        if (isLive) {
          for (const place of structure.getReadPlaces()) {
            if (!usedIds.has(place.identifier.id)) {
              usedIds.add(place.identifier.id);
              changed = true;
            }
          }
        }
      }
    }
  }

  /**
   * Removes structures that are dead: no side effects and no written
   * places used downstream.
   */
  private removeDeadStructures(usedIds: Set<IdentifierId>): boolean {
    let changed = false;

    for (const [blockId, structure] of this.functionIR.structures) {
      if (structure.hasSideEffects()) continue;
      const isLive = structure
        .getWrittenPlaces()
        .some((p) => usedIds.has(p.identifier.id));
      if (!isLive) {
        this.functionIR.structures.delete(blockId);
        this.functionIR.recomputeCFG();
        changed = true;
      }
    }

    return changed;
  }

  /**
   * Drops phis whose result is never used. Keeps SSA elimination
   * consistent with instruction DCE.
   */
  private removeDeadPhis(usedIds: Set<IdentifierId>): boolean {
    let changed = false;

    for (const phi of this.phis) {
      if (!usedIds.has(phi.place.identifier.id)) {
        this.phis.delete(phi);
        changed = true;
      }
    }

    return changed;
  }

  /**
   * Removes dead instructions. An instruction is dead when it has no
   * side effects and none of its written places are used. Dead
   * instructions that wrap a side-effectful value are replaced via
   * `asSideEffect()` to preserve the effect.
   */
  private removeDeadInstructions(usedIds: Set<IdentifierId>): boolean {
    let changed = false;

    for (const block of this.functionIR.blocks.values()) {
      const before = block.instructions.length;
      block.instructions = block.instructions.flatMap((instr): BaseInstruction[] => {
        if (instr.hasSideEffects(this.environment)) return [instr];
        if (instr.getWrittenPlaces().some((p) => usedIds.has(p.identifier.id))) return [instr];

        const replacement = instr.asSideEffect();
        if (replacement && replacement.hasSideEffects(this.environment)) return [replacement];

        return [];
      });

      if (block.instructions.length !== before) {
        changed = true;
      }
    }

    return changed;
  }
}
