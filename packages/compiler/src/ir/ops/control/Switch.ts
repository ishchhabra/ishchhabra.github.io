import type { OperationId } from "../../core";
import type { Identifier } from "../../core/Identifier";
import {
  type CloneContext,
  nextId,
  Operation,
  remapPlace,
  remapRegion,
  Trait,
} from "../../core/Operation";
import type { Place } from "../../core/Place";
import { Region } from "../../core/Region";

/**
 * `switch (discriminant) { case a: ... default: ... }`.
 *
 * Inline structured op. Each case is a region; the discriminant is
 * the op's operand. Case tests are carried alongside the case regions
 * via the `caseTests` list (parallel to `regions`): a `null` entry
 * marks the `default` case.
 *
 * JS switch semantics (fall-through, shared bindings) are expressed
 * by having each case region terminate in a YieldOp when it falls
 * off the end, or in a BreakOp to exit the switch. Fall-through from
 * one case to the next is desugared at the frontend into explicit
 * jumps.
 */
export class SwitchOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.HasRegions]);

  constructor(
    id: OperationId,
    public readonly discriminant: Place,
    /**
     * Per-case test expressions. Parallel to `regions`: `caseTests[i]`
     * is the test for `regions[i]`. `null` marks the default case.
     */
    public readonly caseTests: readonly (Place | null)[],
    regions: readonly Region[],
    public readonly label?: string,
  ) {
    super(id, regions);
  }

  getOperands(): Place[] {
    const places = [this.discriminant];
    for (const t of this.caseTests) {
      if (t !== null) places.push(t);
    }
    return places;
  }

  rewrite(values: Map<Identifier, Place>): SwitchOp {
    const discriminant = values.get(this.discriminant.identifier) ?? this.discriminant;
    let changed = false;
    const newTests = this.caseTests.map((t) => {
      if (t === null) return null;
      const next = values.get(t.identifier) ?? t;
      if (next !== t) changed = true;
      return next;
    });
    if (discriminant === this.discriminant && !changed) return this;
    return new SwitchOp(this.id, discriminant, newTests, this.regions, this.label);
  }

  clone(ctx: CloneContext): SwitchOp {
    return new SwitchOp(
      nextId(ctx),
      remapPlace(ctx, this.discriminant),
      this.caseTests.map((t) => (t === null ? null : remapPlace(ctx, t))),
      this.regions.map((r) => remapRegion(ctx, r)),
      this.label,
    );
  }
}
