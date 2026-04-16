import type { OperationId } from "../../core";
import type { Identifier } from "../../core/Identifier";
import { type CloneContext, nextId, Operation, remapRegion, Trait } from "../../core/Operation";
import type { Place } from "../../core/Place";
import { Region } from "../../core/Region";

/**
 * Labeled block statement: `foo: { ... }`. A `break foo` inside the
 * body exits the op early.
 *
 * Inline structured op — lives directly in its parent block, owns
 * a single body region, no fallthrough field.
 */
export class LabeledBlockOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.HasRegions]);

  constructor(
    id: OperationId,
    public readonly label: string,
    bodyRegion: Region,
  ) {
    super(id, [bodyRegion]);
  }

  get bodyRegion(): Region {
    return this.regions[0];
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
    return new LabeledBlockOp(nextId(ctx), this.label, remapRegion(ctx, this.regions[0]));
  }
}
