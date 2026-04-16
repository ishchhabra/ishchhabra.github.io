import type { BasicBlock, BlockId } from "./Block";
import type { LexicalScopeKind } from "./LexicalScope";
import type { Operation } from "./Operation";

/**
 * An ordered list of blocks owned by an {@link Operation}.
 *
 * Regions express structured control flow the MLIR way: a
 * structured op (IfOp, WhileOp, ForOfOp, ...) owns one or more
 * regions whose blocks describe its nested control flow directly.
 * Nesting is explicit — a FuncOp's body is a region that contains
 * blocks, those blocks may contain a ForOfOp whose own body is
 * another region, and so on.
 *
 * The first block in `blocks` is the region entry — control flow
 * enters there. Inside the region, blocks are connected through
 * their terminator ops' successors the same way any CFG is wired.
 *
 * Regions are exposed on `Operation.regions` as a read-only array.
 * Most ops have `regions === []`. Structured CF ops have one or
 * more.
 */
export class Region {
  /**
   * Parent op. Set automatically when this region is passed to
   * `new Operation(id, regions)`. `null` for the function-level body
   * region (which has no enclosing op) and for regions that haven't
   * been attached yet (transient state during construction).
   */
  public parent: Operation | null = null;

  /**
   * If this region introduces a new ECMAScript lexical scope, the
   * kind of that scope. `undefined` means the region is scope-
   * transparent (its blocks share the enclosing region's scope).
   *
   * This is the canonical storage for scope information — block-level
   * `scopeId` is legacy and will be deleted once all readers migrate
   * to walking the region-parent chain.
   */
  public scopeKind: LexicalScopeKind | undefined;

  constructor(
    public readonly blocks: BasicBlock[],
    scopeKind?: LexicalScopeKind,
  ) {
    this.scopeKind = scopeKind;
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
   * Walk every block in this region and every block reachable through
   * nested regions owned by any op in the region, in program order.
   *
   * This is the MLIR-style region walker: it yields the region's own
   * blocks, and for each block recurses into regions owned by every
   * op in that block (not just the structure slot). That makes the
   * walker correct for dual-traited ops like `SwitchOp` and `TryOp`,
   * whose case / handler / finally regions sit on the terminator
   * slot rather than the structure slot.
   */
  *allBlocks(): IterableIterator<BasicBlock> {
    for (const block of this.blocks) {
      yield block;
      for (const op of block.getAllOps()) {
        for (const region of op.regions) {
          yield* region.allBlocks();
        }
      }
    }
  }
}
