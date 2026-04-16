import type { OperationId } from "../../core";
import type { Identifier } from "../../core/Identifier";
import {
  type CloneContext,
  nextId,
  Operation,
  remapPlace,
  remapRegion,
  Trait,
  VerifyError,
} from "../../core/Operation";
import type { Place } from "../../core/Place";
import { Region } from "../../core/Region";

/**
 * `if (test) { consequent } else { alternate }`. The textbook MLIR
 * `scf.if` analog.
 *
 * An IfOp owns one or two regions (consequent, optional alternate).
 * It lives *inline* in its parent block just like any other op —
 * there is no separate "header block" around it and no "fallthrough
 * block" after it. The ops that come after an IfOp in the parent
 * block are simply the next ops in the same block; control reaches
 * them when the IfOp finishes.
 *
 * Each arm region ends in a {@link YieldOp} terminator that carries
 * exactly `resultPlaces.length` values. Those values bind positionally
 * to the IfOp's {@link resultPlaces}. If an arm does not complete
 * normally (it contains a `return` / `throw` / `break` / `continue`
 * as its terminator) then that arm does not contribute a yield —
 * control simply exits the enclosing construct through the structural
 * exit instead.
 *
 * For a statement-level `if` with no merged values, `resultPlaces`
 * is empty and each arm's YieldOp carries zero values.
 *
 * For an expression-level `if` / ternary, `resultPlaces.length >= 1`
 * and each arm yields the corresponding values; ops after the IfOp
 * reference these result places directly.
 *
 * For a statement-level `if` that mutates `let` variables in its
 * arms, SSA lifts those mutations into result places so the updated
 * values flow out of the op naturally.
 */
export class IfOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.HasRegions]);

  public readonly resultPlaces: readonly Place[];

  constructor(
    id: OperationId,
    public readonly test: Place,
    resultPlaces: readonly Place[],
    consequentRegion: Region,
    alternateRegion: Region | undefined,
  ) {
    super(
      id,
      alternateRegion !== undefined ? [consequentRegion, alternateRegion] : [consequentRegion],
    );
    this.resultPlaces = resultPlaces;
  }

  get consequentRegion(): Region {
    return this.regions[0];
  }

  get alternateRegion(): Region | undefined {
    return this.regions[1];
  }

  get hasAlternate(): boolean {
    return this.regions.length > 1;
  }

  getOperands(): Place[] {
    return [this.test];
  }

  override getDefs(): Place[] {
    return [...this.resultPlaces];
  }

  rewrite(values: Map<Identifier, Place>): IfOp {
    const test = values.get(this.test.identifier) ?? this.test;
    if (test === this.test) return this;
    return new IfOp(this.id, test, this.resultPlaces, this.regions[0], this.regions[1]);
  }

  clone(ctx: CloneContext): IfOp {
    return new IfOp(
      nextId(ctx),
      remapPlace(ctx, this.test),
      this.resultPlaces.map((p) => remapPlace(ctx, p)),
      remapRegion(ctx, this.regions[0]),
      this.regions[1] !== undefined ? remapRegion(ctx, this.regions[1]) : undefined,
    );
  }

  override verify(): void {
    super.verify();
    if (this.regions.length < 1 || this.regions.length > 2) {
      throw new VerifyError(this, `expected 1 or 2 regions, got ${this.regions.length}`);
    }
  }
}
