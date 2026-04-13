import type { OperationId } from "../../core";
import type { BlockId } from "../../core/Block";
import type { Identifier } from "../../core/Identifier";
import {
  type CloneContext,
  nextId,
  Operation,
  remapBlockId,
  remapRegion,
  Trait,
} from "../../core/Operation";
import type { Place } from "../../core/Place";
import { Region } from "../../core/Region";

/**
 * Standalone source-level block statement `{ ... }`.
 *
 * Replaces `BlockStructure`. Declares `Trait.HasRegions`. Note that
 * the class name is `BlockOp` (as in "block statement"), distinct
 * from `BasicBlock` which is the IR-level CFG node type.
 *
 * The body block is owned by the nested region; the `body` accessor
 * derives the entry block id from `regions[0].entry.id` rather than
 * being stored as a separate field.
 */
export class BlockOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.HasRegions]);

  constructor(
    id: OperationId,
    public header: BlockId,
    public exit: BlockId,
    bodyRegion: Region,
  ) {
    super(id, [bodyRegion]);
  }

  /** Entry block id of the body region. */
  get body(): BlockId {
    return this.regions[0].entry.id;
  }

  getEdges(): Array<[BlockId, BlockId]> {
    return [[this.header, this.body]];
  }

  override getBlockRefs(): BlockId[] {
    return [this.body, this.exit];
  }

  getOperands(): Place[] {
    return [];
  }

  override getDefs(): Place[] {
    return [];
  }

  rewrite(_values: Map<Identifier, Place>): BlockOp {
    return this;
  }

  clone(ctx: CloneContext): BlockOp {
    const bodyRegion = remapRegion(ctx, this.regions[0]);
    return new BlockOp(
      nextId(ctx),
      remapBlockId(ctx, this.header),
      remapBlockId(ctx, this.exit),
      bodyRegion,
    );
  }

  override remap(from: BlockId, to: BlockId): void {
    if (this.header === from) this.header = to;
    if (this.exit === from) this.exit = to;
    // body is derived from regions[0].entry.id; no remap needed —
    // the region's block list is updated separately.
  }
}
