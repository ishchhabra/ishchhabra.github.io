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
 * Labeled block statement: `foo: { ... }`. `break foo` exits early
 * through the fallthrough block. Replaces `LabeledBlockStructure`.
 */
export class LabeledBlockOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.HasRegions]);

  constructor(
    id: OperationId,
    public header: BlockId,
    public fallthrough: BlockId,
    public readonly label: string,
    bodyRegion: Region,
  ) {
    super(id, [bodyRegion]);
  }

  /** Entry block id of the body region. */
  get body(): BlockId {
    return this.regions[0].entry.id;
  }

  getEdges(): Array<[BlockId, BlockId]> {
    return [
      [this.header, this.body],
      [this.header, this.fallthrough],
    ];
  }

  override getBlockRefs(): BlockId[] {
    return [this.body, this.fallthrough];
  }

  getOperands(): Place[] {
    return [];
  }

  override getDefs(): Place[] {
    return [];
  }

  rewrite(_values: Map<Identifier, Place>): LabeledBlockOp {
    return this;
  }

  clone(ctx: CloneContext): LabeledBlockOp {
    return new LabeledBlockOp(
      nextId(ctx),
      remapBlockId(ctx, this.header),
      remapBlockId(ctx, this.fallthrough),
      this.label,
      remapRegion(ctx, this.regions[0]),
    );
  }

  override remap(from: BlockId, to: BlockId): void {
    if (this.header === from) this.header = to;
    if (this.fallthrough === from) this.fallthrough = to;
    // body is derived from regions[0].entry.id.
  }
}
