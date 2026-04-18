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
    public readonly discriminant: Value,
    /**
     * Per-case test expressions. Parallel to `regions`: `caseTests[i]`
     * is the test for `regions[i]`. `null` marks the default case.
     */
    public readonly caseTests: readonly (Value | null)[],
    regions: readonly Region[],
    public readonly label?: string,
  ) {
    super(id, regions);
  }

  getOperands(): Value[] {
    const places = [this.discriminant];
    for (const t of this.caseTests) {
      if (t !== null) places.push(t);
    }
    return places;
  }

  rewrite(values: Map<Value, Value>): SwitchOp {
    const discriminant = values.get(this.discriminant) ?? this.discriminant;
    let changed = false;
    const newTests = this.caseTests.map((t) => {
      if (t === null) return null;
      const next = values.get(t) ?? t;
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
