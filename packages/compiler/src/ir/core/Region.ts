import type { BasicBlock, BlockId } from "./Block";
import type { Operation } from "./Operation";

/**
 * An ordered list of blocks owned by an {@link Operation}.
 *
 * Regions are how MLIR-style structured control flow is expressed:
 * instead of a `ForOfOp` pointing at a `body` BlockId in a flat
 * function-level block map, it owns a `Region` whose blocks describe
 * the loop body directly. Nesting is explicit — a FuncOp's body is a
 * region that contains blocks, those blocks may contain a ForOfOp
 * whose own body is another region, and so on.
 *
 * The first block in `blocks` is the region entry — control flow
 * enters there. Inside the region, blocks are connected through
 * their terminator ops' successors the same way any CFG is wired.
 *
 * Regions are exposed on `Operation.regions` as a read-only array.
 * Most ops have `regions === []`. Structured CF ops (ForOfOp, IfOp,
 * BlockOp, ...) have one or more.
 *
 * NOTE: during the transition from the flat-CFG + overlay model to
 * full region ownership, some structured ops still carry BlockId
 * fields (`header`, `body`, `fallthrough`) in parallel with a
 * region. The BlockId path is the legacy wire; the region is the
 * destination. Follow-up passes consume the regions; the BlockId
 * fields go away when the last consumer is migrated.
 */
export class Region {
  /**
   * Parent op. Set automatically when this region is passed to
   * `new Operation(id, regions)`. `null` for the function-level body
   * region (which has no enclosing op) and for regions that haven't
   * been attached yet (transient state during construction).
   */
  public parent: Operation | null = null;

  constructor(public readonly blocks: BasicBlock[]) {
    // Maintain the back-pointer invariant: every block in a region
    // points back to the region it belongs to.
    for (const block of blocks) {
      (block as { parent: Region | null }).parent = this;
    }
  }

  /** The entry block of this region. Throws if the region is empty. */
  get entry(): BasicBlock {
    const first = this.blocks[0];
    if (first === undefined) {
      throw new Error("Region has no entry block");
    }
    return first;
  }

  /** Returns `true` if the region contains no blocks. */
  get isEmpty(): boolean {
    return this.blocks.length === 0;
  }

  /** Returns every BlockId in this region. */
  getBlockIds(): BlockId[] {
    return this.blocks.map((b) => b.id);
  }

  /**
   * Append a block to this region. Updates the block's parent
   * back-pointer. The block must not already belong to another region
   * — use {@link moveBlockHere} for reparenting.
   */
  appendBlock(block: BasicBlock): void {
    if (block.parent !== null && block.parent !== this) {
      throw new Error(`Region.appendBlock: bb${block.id} already belongs to another region`);
    }
    block.parent = this;
    this.blocks.push(block);
  }

  /**
   * Remove `block` from this region. Clears the block's parent
   * back-pointer. Throws if `block` is not in this region.
   */
  removeBlock(block: BasicBlock): void {
    const index = this.blocks.indexOf(block);
    if (index < 0) {
      throw new Error(`Region.removeBlock: bb${block.id} not in region`);
    }
    this.blocks.splice(index, 1);
    block.parent = null;
  }

  /**
   * Move `block` from its current parent region (if any) into this
   * region. Updates both regions' block arrays and the block's
   * parent back-pointer.
   */
  moveBlockHere(block: BasicBlock): void {
    if (block.parent === this) return;
    if (block.parent !== null) {
      block.parent.removeBlock(block);
    }
    this.appendBlock(block);
  }

  /**
   * Walk every block in this region and its nested structures'
   * regions in program order. Yields the region's own blocks first,
   * then recurses into blocks' `structure.regions`.
   *
   * This is the MLIR-style region walker: it visits every block
   * reachable from the region root, regardless of nesting depth.
   */
  *allBlocks(): IterableIterator<BasicBlock> {
    for (const block of this.blocks) {
      yield block;
      const structure = block.structure;
      if (structure !== undefined) {
        for (const region of structure.regions) {
          yield* region.allBlocks();
        }
      }
    }
  }
}
