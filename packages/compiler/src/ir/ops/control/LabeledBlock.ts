import type { OperationId } from "../../core";
import type { Value } from "../../core/Value";
import {
  type CloneContext,
  nextId,
  Operation,
  remapPlace,
  remapRegion,
  Trait,
} from "../../core/Operation";
import { Region } from "../../core/Region";

/**
 * Labeled block statement: `foo: { ... }`. A `break foo` inside the
 * body exits the op early.
 *
 * Inline structured op — lives directly in its parent block, owns
 * a single body region, no fallthrough field.
 *
 * `resultPlaces` receive values on body's natural completion (the
 * terminal YieldOp) and from any `break foo` that targets this op.
 * Empty for labeled blocks with no loop-carried SSA values.
 */
export class LabeledBlockOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.HasRegions]);

  public readonly resultPlaces: readonly Value[];

  constructor(
    id: OperationId,
    public readonly label: string,
    bodyRegion: Region,
    resultPlaces: readonly Value[] = [],
  ) {
    super(id, [bodyRegion]);
    this.resultPlaces = resultPlaces;
  }

  get bodyRegion(): Region {
    return this.regions[0];
  }

  getOperands(): Value[] {
    return [];
  }

  override getDefs(): Value[] {
    return [...this.resultPlaces];
  }

  rewrite(_values: Map<Value, Value>): LabeledBlockOp {
    return this;
  }

  clone(ctx: CloneContext): LabeledBlockOp {
    return new LabeledBlockOp(
      nextId(ctx),
      this.label,
      remapRegion(ctx, this.regions[0]),
      this.resultPlaces.map((p) => remapPlace(ctx, p)),
    );
  }
}
