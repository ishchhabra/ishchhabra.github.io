import {
  BaseInstruction,
  BasicBlock,
  BindingIdentifierInstruction,
  BlockId,
  CopyInstruction,
  IdentifierId,
  ObjectPropertyInstruction,
  RestElementInstruction,
  StoreLocalInstruction,
} from "../../../ir";
import { ArrayPatternInstruction } from "../../../ir/instructions/pattern/ArrayPattern";
import { AssignmentPatternInstruction } from "../../../ir/instructions/pattern/AssignmentPattern";
import { ObjectPatternInstruction } from "../../../ir/instructions/pattern/ObjectPattern";
import { PlaceId } from "../../../ir/core/Place";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";

/**
 * A late Dead Code Elimination (DCE) pass that removes unused instructions
 * which define a place not read by any other instruction (and have no side
 * effects). This runs after SSA elimination, so it operates on the
 * post-SSA IR without phi nodes or def-use chains.
 *
 * Algorithm: single-pass over blocks in post-order (leaves first). A shared
 * `usedPlaceIds` set accumulates reads across blocks. By processing
 * successors before predecessors, a definition's downstream reads are
 * already in the set when we decide whether to keep it.
 *
 * The base class re-runs `step()` until fixpoint, so chains of dead
 * instructions are cleaned up across iterations.
 */
export class LateDeadCodeEliminationPass extends BaseOptimizationPass {
  protected step(): OptimizationResult {
    let changed = false;
    const usedPlaceIds = new Set<IdentifierId>();
    const postOrder = this.computePostOrder();

    for (const blockId of postOrder) {
      const block = this.functionIR.blocks.get(blockId);
      if (!block) {
        throw new Error(`Block ${blockId} not found`);
      }
      if (this.eliminateDeadCodeInBlock(block, usedPlaceIds)) {
        changed = true;
      }
    }

    return { changed };
  }

  /**
   * Computes a post-order traversal of the CFG via DFS from the entry block.
   * Post-order visits successors before predecessors, so all downstream
   * reads are collected before we process the defining block.
   */
  private computePostOrder(): BlockId[] {
    const visited = new Set<BlockId>();
    const result: BlockId[] = [];

    const dfs = (blockId: BlockId) => {
      if (visited.has(blockId)) return;
      visited.add(blockId);
      for (const succ of this.functionIR.successors.get(blockId) ?? []) {
        dfs(succ);
      }
      result.push(blockId);
    };

    dfs(this.functionIR.entryBlockId);
    return result;
  }

  private eliminateDeadCodeInBlock(block: BasicBlock, usedPlaceIds: Set<IdentifierId>): boolean {
    const instrs = block.instructions;
    const newInstrs: BaseInstruction[] = [];
    let changed = false;

    // Build a map from PlaceId → defining instruction for pattern tree walking.
    const placeToInstr = new Map<PlaceId, BaseInstruction>();
    for (const instr of instrs) {
      placeToInstr.set(instr.place.id, instr);
    }

    // 1) Gather places read by instructions and the terminal in this block.
    for (const instr of instrs) {
      for (const place of instr.getReadPlaces()) {
        usedPlaceIds.add(place.identifier.id);
      }
    }

    if (block.terminal) {
      for (const place of block.terminal.getReadPlaces()) {
        usedPlaceIds.add(place.identifier.id);
      }
    }

    // 2) Filter out pure instructions that define a place nobody reads.
    for (const instr of instrs) {
      if (this.shouldKeepInstruction(instr, usedPlaceIds, placeToInstr)) {
        newInstrs.push(instr);
      } else {
        changed = true;
      }
    }

    block.instructions = newInstrs;
    return changed;
  }

  /**
   * Keep an instruction if:
   *   - It's a copy (inserted by SSA elimination, handled by early DCE)
   *   - It's impure (has side effects)
   *   - Its defined place is read by another instruction
   *   - It's a StoreLocal with a pattern lval where any leaf binding is used
   */
  private shouldKeepInstruction(
    instruction: BaseInstruction,
    usedPlaceIds: Set<IdentifierId>,
    placeToInstr: Map<PlaceId, BaseInstruction>,
  ): boolean {
    if (instruction instanceof CopyInstruction) {
      return true;
    }

    if (!instruction.isPure) {
      return true;
    }

    if (instruction instanceof StoreLocalInstruction) {
      // For simple lvals (identifiers), check directly.
      if (usedPlaceIds.has(instruction.lval.identifier.id)) {
        return true;
      }

      // For pattern lvals (ObjectPattern/ArrayPattern from rest-element
      // fallback), walk the pattern tree to check if any leaf binding is used.
      const lvalInstr = placeToInstr.get(instruction.lval.id);
      if (
        lvalInstr instanceof ObjectPatternInstruction ||
        lvalInstr instanceof ArrayPatternInstruction
      ) {
        return this.hasUsedBinding(lvalInstr, usedPlaceIds, placeToInstr);
      }

      return false;
    }

    return usedPlaceIds.has(instruction.place.identifier.id);
  }

  /**
   * Recursively walks a pattern instruction tree to check if any leaf
   * BindingIdentifier place is in the used set.
   */
  private hasUsedBinding(
    instruction: BaseInstruction,
    usedPlaceIds: Set<IdentifierId>,
    placeToInstr: Map<PlaceId, BaseInstruction>,
  ): boolean {
    if (instruction instanceof BindingIdentifierInstruction) {
      return usedPlaceIds.has(instruction.place.identifier.id);
    }

    return this.getPatternChildren(instruction).some((child) => {
      const childInstr = placeToInstr.get(child.id);
      return (
        childInstr !== undefined && this.hasUsedBinding(childInstr, usedPlaceIds, placeToInstr)
      );
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
