import { BasicBlock, BlockId, JumpOp } from "../../ir";

/**
 * Minimal subset of `FuncOp`'s block API used by this analysis.
 */
export interface BlockSource {
  allBlocks(): IterableIterator<BasicBlock>;
  maybeBlock(id: BlockId): BasicBlock | undefined;
}

/**
 * Build a predecessor map for a function's flat CFG. Under the
 * textbook MLIR model, inter-block CFG edges are carried only by
 * explicit terminators (`JumpOp`) — structured control flow lives
 * inside nested regions owned by inline structured ops and does not
 * contribute to the outer CFG. This keeps the algorithm textbook:
 * walk every block, read its terminator, record its outgoing edge
 * target as a predecessor of that target.
 *
 * Blocks reached transitively through structured ops' nested regions
 * are NOT part of the outer CFG — they belong to their own nested
 * region's CFG, which a nested pass can analyze separately.
 */
export function getPredecessors(blocks: BlockSource) {
  const predecessors = new Map<BlockId, Set<BlockId>>();

  for (const block of blocks.allBlocks()) {
    predecessors.set(block.id, new Set());
  }

  for (const block of blocks.allBlocks()) {
    const terminal = block.terminal;
    if (terminal instanceof JumpOp) {
      const succ = predecessors.get(terminal.target.id);
      if (succ !== undefined) {
        succ.add(block.id);
      }
    }
  }

  return predecessors;
}
