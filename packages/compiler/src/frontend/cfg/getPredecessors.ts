import {
  BasicBlock,
  BlockId,
  BranchOp,
  BreakOp,
  ContinueOp,
  ForInOp,
  ForOfOp,
  JumpOp,
  LabeledBlockOp,
  SwitchOp,
  TryOp,
} from "../../ir";
import type { Structure } from "../../ir/ops/control";

/**
 * Minimal subset of `FunctionIR`'s block API used by this analysis.
 * Accepting an interface rather than the concrete type keeps the
 * analysis usable in places where only a block iterator + id lookup
 * is available (e.g. FunctionIR.exitBlockId before the public API
 * is fully available during construction).
 */
export interface BlockSource {
  allBlocks(): IterableIterator<BasicBlock>;
  maybeBlock(id: BlockId): BasicBlock | undefined;
}

/**
 * Resolve the structured loop / block that a `BreakOp` / `ContinueOp`
 * targets. Walks up the region tree from the carrying block to find
 * the closest enclosing structured op that matches the (optional)
 * label and op-kind constraint.
 *
 * Returns the implicit `{ header, fallthrough }` block ids the
 * structural exit should add as CFG successors:
 *   - `continue` → header (loop iteration target)
 *   - `break`    → fallthrough (post-construct block)
 */
function resolveStructuralTarget(
  carryingBlock: BasicBlock,
  kind: "break" | "continue",
  label: string | undefined,
  blocks: BlockSource,
): { header: BlockId; fallthrough: BlockId } | undefined {
  let region = carryingBlock.parent;
  while (region !== null) {
    const op = region.parent;
    if (op === null) return undefined;

    // ForOf / ForIn — match for both break and continue.
    if (op instanceof ForOfOp || op instanceof ForInOp) {
      if (label === undefined || op.label === label) {
        return { header: op.header, fallthrough: op.fallthrough };
      }
    }
    // Labeled block — only matched by `break label`.
    else if (op instanceof LabeledBlockOp) {
      if (kind === "break" && label !== undefined && op.label === label) {
        return { header: op.header, fallthrough: op.fallthrough };
      }
    }
    // Plain `BlockOp` is intentionally NOT matched: in JS, unlabeled
    // `break;` always targets the closest loop/switch — never a bare
    // `{ ... }` block — so a plain block can't be a structural exit
    // target. Labeled blocks are handled above.

    // Climb out: find the structured op's owning header block, then
    // step up to its parent region. All structured op subclasses
    // expose a `header: BlockId` field.
    const headerId = (op as { header?: BlockId }).header;
    if (headerId === undefined) return undefined;
    const enclosingBlock = blocks.maybeBlock(headerId);
    if (enclosingBlock === undefined) return undefined;
    region = enclosingBlock.parent;
  }
  return undefined;
}

export function getPredecessors(blocks: BlockSource, structures: ReadonlyMap<BlockId, Structure>) {
  const predecessors = new Map<BlockId, Set<BlockId>>();
  const visited = new Set<BlockId>();

  // Initialize empty predecessor sets
  for (const block of blocks.allBlocks()) {
    predecessors.set(block.id, new Set());
  }

  const processBlock = (blockId: BlockId, prevBlock: BasicBlock | undefined) => {
    const block = blocks.maybeBlock(blockId);
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

    const structure = structures.get(blockId);
    if (structure) {
      for (const [, target] of structure.getEdges()) {
        predecessors.get(target)?.add(blockId);
        processBlock(target, block);
      }
      return;
    }

    // Visit successors based on terminal type
    if (block.terminal instanceof JumpOp) {
      processBlock(block.terminal.target, block);
    } else if (block.terminal instanceof BranchOp) {
      processBlock(block.terminal.consequent, block);
      processBlock(block.terminal.alternate, block);
    } else if (block.terminal instanceof SwitchOp) {
      for (const c of block.terminal.cases) {
        processBlock(c.block, block);
      }
      processBlock(block.terminal.fallthrough, block);
    } else if (block.terminal instanceof TryOp) {
      processBlock(block.terminal.tryBlock, block);
      if (block.terminal.handler !== null) {
        processBlock(block.terminal.handler.block, block);
      }
      if (block.terminal.finallyBlock !== null) {
        processBlock(block.terminal.finallyBlock, block);
      }
      processBlock(block.terminal.fallthrough, block);
    } else if (block.terminal instanceof BreakOp) {
      // Structural exit to the enclosing construct's fallthrough.
      const target = resolveStructuralTarget(block, "break", block.terminal.label, blocks);
      if (target !== undefined) {
        predecessors.get(target.fallthrough)?.add(blockId);
        processBlock(target.fallthrough, block);
      }
    } else if (block.terminal instanceof ContinueOp) {
      // Structural back-edge to the enclosing loop's header.
      const target = resolveStructuralTarget(block, "continue", block.terminal.label, blocks);
      if (target !== undefined) {
        predecessors.get(target.header)?.add(blockId);
        processBlock(target.header, block);
      }
    }
  };

  // Start from the entry block (first block yielded by allBlocks())
  const firstBlock = blocks.allBlocks().next().value;
  if (firstBlock === undefined) return predecessors;
  processBlock(firstBlock.id, undefined);
  return predecessors;
}
