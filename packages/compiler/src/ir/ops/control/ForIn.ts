import type { OperationId } from "../../core";
import {
  type DestructureTarget,
  getDestructureTargetDefs,
  getDestructureTargetOperands,
  rewriteDestructureTarget,
} from "../../core/Destructure";
import type { Value } from "../../core/Value";
import {
  type CloneContext,
  nextId,
  Operation,
  remapPlace,
  remapRegion,
  Trait,
  VerifyError,
} from "../../core/Operation";
import { Region } from "../../core/Region";

/**
 * `for (key in object) { body }`.
 *
 * Inline structured op — lives directly in its parent block, owns
 * a single body region, no fallthrough field.
 */
export class ForInOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.HasRegions]);

  public readonly resultPlaces: readonly Value[];
  public readonly inits: readonly Value[];

  constructor(
    id: OperationId,
    public readonly iterationValue: Value,
    public readonly iterationTarget: DestructureTarget,
    public readonly object: Value,
    bodyRegion: Region,
    public readonly label?: string,
    resultPlaces: readonly Value[] = [],
    inits: readonly Value[] = [],
  ) {
    bodyRegion.scopeKind = "for";
    super(id, [bodyRegion]);
    this.resultPlaces = resultPlaces;
    this.inits = inits;
  }

  get bodyRegion(): Region {
    return this.regions[0];
  }

  getOperands(): Value[] {
    return [...getDestructureTargetOperands(this.iterationTarget), this.object];
  }

  override getDefs(): Value[] {
    return [
      this.iterationValue,
      ...getDestructureTargetDefs(this.iterationTarget),
      ...this.resultPlaces,
    ];
  }

  rewrite(values: Map<Value, Value>): ForInOp {
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
      iterationValue,
      iterationTarget,
      object,
      this.regions[0],
      this.label,
      this.resultPlaces,
      this.inits,
    );
  }

  clone(ctx: CloneContext): ForInOp {
    return new ForInOp(
      nextId(ctx),
      remapPlace(ctx, this.iterationValue),
      rewriteDestructureTarget(this.iterationTarget, ctx.valueMap, {
        rewriteDefinitions: true,
      }),
      remapPlace(ctx, this.object),
      remapRegion(ctx, this.regions[0]),
      this.label,
      this.resultPlaces.map((p) => remapPlace(ctx, p)),
      this.inits.map((p) => remapPlace(ctx, p)),
    );
  }

  override verify(): void {
    super.verify();
    if (this.regions.length !== 1) {
      throw new VerifyError(this, `expected 1 region, got ${this.regions.length}`);
    }
  }
}
