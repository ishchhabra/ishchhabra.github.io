import {
  BaseInstruction,
  BasicBlock,
  BlockId,
  CopyInstruction,
  IdentifierId,
  StoreLocalInstruction,
} from "../../../ir";
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
      if (this.shouldKeepInstruction(instr, usedPlaceIds)) {
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
   */
  private shouldKeepInstruction(
    instruction: BaseInstruction,
    usedPlaceIds: Set<IdentifierId>,
  ): boolean {
    if (instruction instanceof CopyInstruction) {
      return true;
    }

    if (!instruction.isPure) {
      return true;
    }

    if (instruction instanceof StoreLocalInstruction) {
      return usedPlaceIds.has(instruction.lval.identifier.id);
    }

    return usedPlaceIds.has(instruction.place.identifier.id);
  }
}
