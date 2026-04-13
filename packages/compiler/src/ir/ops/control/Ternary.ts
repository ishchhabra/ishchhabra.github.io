import type { OperationId } from "../../core";
import type { BlockId } from "../../core/Block";
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

/**
 * Conditional (ternary) expression. Keeps consequent/alternate as
 * blocks so branch instructions stay in their arms — side effects
 * remain guarded. Codegen emits as
 * `test ? (consequent as expr) : (alternate as expr)`.
 *
 * Replaces `TernaryStructure`. Declares both `HasRegions` (because
 * it's a structured CF op) and `Pure` (because a ternary has no
 * observable effect beyond the arms' effects).
 */
export class TernaryOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.HasRegions, Trait.Pure]);

  constructor(
    id: OperationId,
    public header: BlockId,
    public readonly test: Place,
    public readonly consequentValue: Place,
    public readonly alternateValue: Place,
    public fallthrough: BlockId,
    public readonly resultPlace: Place,
    consequentRegion: Region,
    alternateRegion: Region,
  ) {
    super(id, [consequentRegion, alternateRegion]);
  }

  /** Entry block id of the consequent arm region. */
  get consequent(): BlockId {
    return this.regions[0].entry.id;
  }

  /** Entry block id of the alternate arm region. */
  get alternate(): BlockId {
    return this.regions[1].entry.id;
  }

  getEdges(): Array<[BlockId, BlockId]> {
    return [
      [this.header, this.consequent],
      [this.header, this.alternate],
      [this.header, this.fallthrough],
    ];
  }

  override getBlockRefs(): BlockId[] {
    return [this.consequent, this.alternate, this.fallthrough];
  }

  getOperands(): Place[] {
    return [this.test, this.consequentValue, this.alternateValue];
  }

  override getDefs(): Place[] {
    return [this.resultPlace];
  }

  override hasSideEffects(): boolean {
    return false;
  }

  rewrite(values: Map<Identifier, Place>): TernaryOp {
    const test = this.test.rewrite(values);
    const consequentValue = this.consequentValue.rewrite(values);
    const alternateValue = this.alternateValue.rewrite(values);
    const resultPlace = this.resultPlace.rewrite(values);
    if (
      test === this.test &&
      consequentValue === this.consequentValue &&
      alternateValue === this.alternateValue &&
      resultPlace === this.resultPlace
    ) {
      return this;
    }

    return new TernaryOp(
      this.id,
      this.header,
      test,
      consequentValue,
      alternateValue,
      this.fallthrough,
      resultPlace,
      this.regions[0],
      this.regions[1],
    );
  }

  clone(ctx: CloneContext): TernaryOp {
    return new TernaryOp(
      nextId(ctx),
      remapBlockId(ctx, this.header),
      remapPlace(ctx, this.test),
      remapPlace(ctx, this.consequentValue),
      remapPlace(ctx, this.alternateValue),
      remapBlockId(ctx, this.fallthrough),
      remapPlace(ctx, this.resultPlace),
      remapRegion(ctx, this.regions[0]),
      remapRegion(ctx, this.regions[1]),
    );
  }

  override remap(from: BlockId, to: BlockId): void {
    if (this.header === from) this.header = to;
    if (this.fallthrough === from) this.fallthrough = to;
    // consequent / alternate are derived from regions[i].entry.id.
  }

  override verify(): void {
    super.verify();
    if (this.consequent === this.alternate) {
      throw new VerifyError(this, `consequent === alternate (bb${this.consequent})`);
    }
    if (this.header === this.consequent || this.header === this.alternate) {
      throw new VerifyError(this, "header is also a ternary arm");
    }
    if (this.fallthrough === this.consequent || this.fallthrough === this.alternate) {
      throw new VerifyError(this, "fallthrough is also a ternary arm");
    }
    if (this.regions.length !== 2) {
      throw new VerifyError(this, `expected 2 regions, got ${this.regions.length}`);
    }
  }
}
