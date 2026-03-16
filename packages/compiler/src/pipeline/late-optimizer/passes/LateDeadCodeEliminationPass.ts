import {
  BaseInstruction,
  BindingIdentifierInstruction,
  FunctionDeclarationInstruction,
  IdentifierId,
  ObjectPropertyInstruction,
  RestElementInstruction,
  StoreLocalInstruction,
} from "../../../ir";
import { ArrayPatternInstruction } from "../../../ir/instructions/pattern/ArrayPattern";
import { AssignmentPatternInstruction } from "../../../ir/instructions/pattern/AssignmentPattern";
import { ObjectPatternInstruction } from "../../../ir/instructions/pattern/ObjectPattern";
import { Place, PlaceId } from "../../../ir/core/Place";
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
  protected step(): OptimizationResult {
    let changed = false;
    const defs = new DefMap(this.functionIR);

    // 1. Collect every identifier read by any instruction or terminal.
    const usedIds = new Set<IdentifierId>();
    const placeToInstr = new Map<PlaceId, BaseInstruction>();

    for (const block of this.functionIR.blocks.values()) {
      for (const instr of block.instructions) {
        placeToInstr.set(instr.place.id, instr);
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

    // 2. Remove pure instructions that define an unused identifier.
    for (const block of this.functionIR.blocks.values()) {
      const before = block.instructions.length;
      block.instructions = block.instructions.filter((instr) => {
        if (!instr.isPure) {
          return true;
        }

        if (instr instanceof FunctionDeclarationInstruction) {
          return usedIds.has(instr.identifier.identifier.id);
        }

        if (instr instanceof StoreLocalInstruction) {
          if (usedIds.has(instr.lval.identifier.id)) {
            return true;
          }

          // For pattern lvals (ObjectPattern/ArrayPattern), walk the
          // pattern tree to check if any leaf binding is used.
          const lvalInstr = placeToInstr.get(instr.lval.id);
          if (
            lvalInstr instanceof ObjectPatternInstruction ||
            lvalInstr instanceof ArrayPatternInstruction
          ) {
            return this.hasUsedBinding(lvalInstr, usedIds, placeToInstr);
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

  /**
   * Recursively walks a pattern instruction tree to check if any leaf
   * BindingIdentifier place is in the used set.
   */
  private hasUsedBinding(
    instruction: BaseInstruction,
    usedIds: Set<IdentifierId>,
    placeToInstr: Map<PlaceId, BaseInstruction>,
  ): boolean {
    if (instruction instanceof BindingIdentifierInstruction) {
      return usedIds.has(instruction.place.identifier.id);
    }

    return this.getPatternChildren(instruction).some((child) => {
      const childInstr = placeToInstr.get(child.id);
      return childInstr !== undefined && this.hasUsedBinding(childInstr, usedIds, placeToInstr);
    });
  }

  private getPatternChildren(instruction: BaseInstruction): Place[] {
    if (instruction instanceof ObjectPatternInstruction) return instruction.properties;
    if (instruction instanceof ArrayPatternInstruction) return instruction.elements;
    if (instruction instanceof ObjectPropertyInstruction) return [instruction.value];
    if (instruction instanceof RestElementInstruction) return [instruction.argument];
    if (instruction instanceof AssignmentPatternInstruction) return [instruction.left];
    return [];
  }
}
