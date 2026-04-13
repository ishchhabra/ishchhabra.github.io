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

/** `for (key in object) { body }`. Replaces `ForInStructure`. */
export class ForInOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.HasRegions]);

  constructor(
    id: OperationId,
    public header: BlockId,
    public readonly iterationValue: Place,
    public readonly iterationTarget: DestructureTarget,
    public readonly object: Place,
    public fallthrough: BlockId,
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
    return [...getDestructureTargetOperands(this.iterationTarget), this.object];
  }

  override getDefs(): Place[] {
    return [this.iterationValue, ...getDestructureTargetDefs(this.iterationTarget)];
  }

  rewrite(values: Map<Identifier, Place>): ForInOp {
    const iterationValue = this.iterationValue.rewrite(values);
    const iterationTarget = rewriteDestructureTarget(this.iterationTarget, values, {
      rewriteDefinitions: true,
    });
    const object = this.object.rewrite(values);
    if (
      iterationValue === this.iterationValue &&
      iterationTarget === this.iterationTarget &&
      object === this.object
    ) {
      return this;
    }

    return new ForInOp(
      this.id,
      this.header,
      iterationValue,
      iterationTarget,
      object,
      this.fallthrough,
      this.regions[0],
      this.label,
    );
  }

  clone(ctx: CloneContext): ForInOp {
    return new ForInOp(
      nextId(ctx),
      remapBlockId(ctx, this.header),
      remapPlace(ctx, this.iterationValue),
      rewriteDestructureTarget(this.iterationTarget, ctx.identifierMap, {
        rewriteDefinitions: true,
      }),
      remapPlace(ctx, this.object),
      remapBlockId(ctx, this.fallthrough),
      remapRegion(ctx, this.regions[0]),
      this.label,
    );
  }

  override remap(from: BlockId, to: BlockId): void {
    if (this.header === from) this.header = to;
    if (this.fallthrough === from) this.fallthrough = to;
    // body is derived from regions[0].entry.id.
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
