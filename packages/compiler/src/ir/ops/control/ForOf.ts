import type { OperationId } from "../../core";
import type { BlockId } from "../../core/Block";
import {
  type DestructureTarget,
  getDestructureTargetDefs,
  getDestructureTargetOperands,
  rewriteDestructureTarget,
} from "../../core/Destructure";
import type { Identifier } from "../../core/Identifier";
import {
  type CloneContext,
  nextId,
  Operation,
  remapBlockId,
  remapPlace,
  remapRegion,
  Trait,
  VerifyError,
} from "../../core/Operation";
import type { Place } from "../../core/Place";
import { Region } from "../../core/Region";

/** `for (x of iterable) { body }` / `for await (x of ...)`. Replaces `ForOfStructure`. */
export class ForOfOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.HasRegions]);

  constructor(
    id: OperationId,
    public header: BlockId,
    public readonly iterationValue: Place,
    public readonly iterationTarget: DestructureTarget,
    public readonly iterable: Place,
    public fallthrough: BlockId,
    public readonly isAwait: boolean,
    bodyRegion: Region,
    public readonly label?: string,
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
    return [...getDestructureTargetOperands(this.iterationTarget), this.iterable];
  }

  override getDefs(): Place[] {
    return [this.iterationValue, ...getDestructureTargetDefs(this.iterationTarget)];
  }

  rewrite(values: Map<Identifier, Place>): ForOfOp {
    const iterationValue = this.iterationValue.rewrite(values);
    const iterationTarget = rewriteDestructureTarget(this.iterationTarget, values, {
      rewriteDefinitions: true,
    });
    const iterable = this.iterable.rewrite(values);
    if (
      iterationValue === this.iterationValue &&
      iterationTarget === this.iterationTarget &&
      iterable === this.iterable
    ) {
      return this;
    }

    return new ForOfOp(
      this.id,
      this.header,
      iterationValue,
      iterationTarget,
      iterable,
      this.fallthrough,
      this.isAwait,
      this.regions[0],
      this.label,
    );
  }

  clone(ctx: CloneContext): ForOfOp {
    return new ForOfOp(
      nextId(ctx),
      remapBlockId(ctx, this.header),
      remapPlace(ctx, this.iterationValue),
      rewriteDestructureTarget(this.iterationTarget, ctx.identifierMap, {
        rewriteDefinitions: true,
      }),
      remapPlace(ctx, this.iterable),
      remapBlockId(ctx, this.fallthrough),
      this.isAwait,
      remapRegion(ctx, this.regions[0]),
      this.label,
    );
  }

  override remap(from: BlockId, to: BlockId): void {
    if (this.header === from) this.header = to;
    if (this.fallthrough === from) this.fallthrough = to;
    // body is derived from regions[0].entry.id; the region's blocks
    // update separately when CFG edits happen.
  }

  override verify(): void {
    super.verify();
    if (this.body === this.fallthrough) {
      throw new VerifyError(this, `body === fallthrough (bb${this.body})`);
    }
    if (this.header === this.fallthrough) {
      throw new VerifyError(this, `header === fallthrough (bb${this.header})`);
    }
  }
}
