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
 * `for (target of iterable) { body }` / `for await (target of ...)`.
 *
 * Inline structured op — lives directly in its parent block, owns a
 * single body region, no fallthrough field. Completion of the op
 * transfers control to the next op in the parent block.
 *
 * `resultPlaces` receive values on body's natural exit (iterator
 * exhaustion) and from any `BreakOp` targeting this loop. Empty for
 * loops with no loop-carried SSA values.
 */
export class ForOfOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.HasRegions]);

  public readonly resultPlaces: readonly Value[];
  public readonly inits: readonly Value[];

  constructor(
    id: OperationId,
    public readonly iterationValue: Value,
    public readonly iterationTarget: DestructureTarget,
    public readonly iterable: Value,
    public readonly isAwait: boolean,
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
    return [...getDestructureTargetOperands(this.iterationTarget), this.iterable];
  }

  override getDefs(): Value[] {
    return [
      this.iterationValue,
      ...getDestructureTargetDefs(this.iterationTarget),
      ...this.resultPlaces,
    ];
  }

  rewrite(values: Map<Value, Value>): ForOfOp {
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
      iterationValue,
      iterationTarget,
      iterable,
      this.isAwait,
      this.regions[0],
      this.label,
      this.resultPlaces,
      this.inits,
    );
  }

  clone(ctx: CloneContext): ForOfOp {
    return new ForOfOp(
      nextId(ctx),
      remapPlace(ctx, this.iterationValue),
      rewriteDestructureTarget(this.iterationTarget, ctx.valueMap, {
        rewriteDefinitions: true,
      }),
      remapPlace(ctx, this.iterable),
      this.isAwait,
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
