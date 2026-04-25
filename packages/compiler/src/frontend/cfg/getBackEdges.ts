import { BasicBlock, BlockId } from "../../ir";

/**
 * Minimal block source used by back-edge analysis. The FuncOp
 * satisfies this interface via its `blocks` list.
 */
export interface BlockIdSource {
  blocks: readonly BasicBlock[];
}

/**
 * Loop back edges (reaching edges whose source dominates the target header).
 * Uses dominance but is not part of a dominator tree object — same layering as
 * LLVM keeping loop/back-edge info in `LoopInfo` rather than `DominatorTree`.
 *
 * @param getDominatorsOf - dominator set per block (including the block itself).
 */
export function getBackEdgesWithDominance(
  blocks: BlockIdSource,
  predecessors: Map<BlockId, Set<BlockId>>,
  getDominatorsOf: (blockId: BlockId) => ReadonlySet<BlockId>,
): Map<BlockId, Set<BlockId>> {
  const dominators = new Map<BlockId, Set<BlockId>>();
  for (const { id: blockId } of blocks.blocks) {
    dominators.set(blockId, new Set(getDominatorsOf(blockId)));
  }
  return getBackEdges(blocks, dominators, predecessors);
}

export function getBackEdges(
  blocks: BlockIdSource,
  dominators: Map<BlockId, Set<BlockId>>,
  predecessors: Map<BlockId, Set<BlockId>>,
): Map<BlockId, Set<BlockId>> {
  const backEdges = new Map<BlockId, Set<BlockId>>();
  const blockIds = blocks.blocks.map((block) => block.id);

  // Initialize empty sets for all blocks
  for (const blockId of blockIds) {
    backEdges.set(blockId, new Set());
  }

  for (const [blockId, preds] of predecessors.entries()) {
    const dominatedByBlock = blockIds.filter((b) => dominators.get(b)?.has(blockId));

    for (const pred of preds) {
      if (dominatedByBlock.includes(pred)) {
        // Add the predecessor to the set of back edges for this block
        backEdges.get(blockId)?.add(pred);
      }
    }
  }

  return backEdges;
}
