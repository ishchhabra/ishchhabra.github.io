import type { OperationId } from "../../core";
import type { Identifier } from "../../core/Identifier";
import {
  type CloneContext,
  nextId,
  Operation,
  remapRegion,
  Trait,
  VerifyError,
} from "../../core/Operation";
import type { Place } from "../../core/Place";
import { Region } from "../../core/Region";

/**
 * JS `for (init; test; update) { body }`. Distinct from
 * {@link WhileOp} because JS `continue` inside a for-loop must run
 * the `update` expression before re-evaluating the test, and
 * collapsing the body and update into one region would break
 * `continue` semantics.
 *
 * The init expression / declarations live in the parent block
 * before the ForOp (same as today's lowering). The op owns three
 * regions:
 *
 *   - `beforeRegion` (regions[0]) — the test. Re-entered every
 *     iteration. Terminates in a {@link ConditionOp} carrying the
 *     boolean result.
 *   - `bodyRegion` (regions[1]) — the loop body. Terminates in a
 *     {@link YieldOp} on natural fall-through, or in a
 *     `BreakOp` / `ContinueOp` / `ReturnOp` for structural exits.
 *     A `ContinueOp` inside the body targets the start of the
 *     update region.
 *   - `updateRegion` (regions[2]) — the update expression. Runs at
 *     the end of every iteration (and at every `continue`) before
 *     the test is re-evaluated. Terminates in a {@link YieldOp}.
 *
 * Inline structured op — lives in its parent block, control
 * continues with the next op when the loop exits.
 */
export class ForOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.HasRegions]);

  constructor(
    id: OperationId,
    beforeRegion: Region,
    bodyRegion: Region,
    updateRegion: Region,
    public readonly label?: string,
  ) {
    super(id, [beforeRegion, bodyRegion, updateRegion]);
  }

  get beforeRegion(): Region {
    return this.regions[0];
  }

  get bodyRegion(): Region {
    return this.regions[1];
  }

  get updateRegion(): Region {
    return this.regions[2];
  }

  getOperands(): Place[] {
    return [];
  }

  override getDefs(): Place[] {
    return [];
  }

  rewrite(_values: Map<Identifier, Place>): ForOp {
    return this;
  }

  clone(ctx: CloneContext): ForOp {
    return new ForOp(
      nextId(ctx),
      remapRegion(ctx, this.regions[0]),
      remapRegion(ctx, this.regions[1]),
      remapRegion(ctx, this.regions[2]),
      this.label,
    );
  }

  override verify(): void {
    super.verify();
    if (this.regions.length !== 3) {
      throw new VerifyError(
        this,
        `expected 3 regions (before, body, update), got ${this.regions.length}`,
      );
    }
  }
}
