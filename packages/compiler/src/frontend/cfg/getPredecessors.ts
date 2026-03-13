import {
  BasicBlock,
  BlockId,
  BranchTerminal,
  ForOfTerminal,
  JumpTerminal,
} from "../../ir";

export function getPredecessors(blocks: Map<BlockId, BasicBlock>) {
  const predecessors = new Map<BlockId, Set<BlockId>>();
  const visited = new Set<BlockId>();

  // Initialize empty predecessor sets
  for (const blockId of blocks.keys()) {
    predecessors.set(blockId, new Set());
  }

  const processBlock = (blockId: BlockId, prevBlock: BasicBlock | undefined) => {
    const block = blocks.get(blockId);
    if (block === undefined) {
      return;
    }

    // Add predecessor if we came from a previous block
    if (prevBlock !== undefined) {
      predecessors.get(blockId)?.add(prevBlock.id);
    }

    // Skip if already visited to handle cycles
    if (visited.has(blockId)) return;
    visited.add(blockId);

    // Visit successors based on terminal type
    if (block.terminal instanceof JumpTerminal) {
      processBlock(block.terminal.target, block);
    } else if (block.terminal instanceof BranchTerminal) {
      processBlock(block.terminal.consequent, block);
      processBlock(block.terminal.alternate, block);
    } else if (block.terminal instanceof ForOfTerminal) {
      processBlock(block.terminal.body, block);
      processBlock(block.terminal.fallthrough, block);
    }
  };

  // Start from the entry block (first block in the map)
  processBlock(blocks.keys().next().value!, undefined);
  return predecessors;
}
