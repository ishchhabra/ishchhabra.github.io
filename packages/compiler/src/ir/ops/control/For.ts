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
 * The op owns four regions, matching the four semantic slots of a
 * JS for-statement:
 *
 *   - `initRegion` (regions[0]) — the init expression / declarations.
 *     Runs once, before the first iteration. Terminates in a
 *     {@link YieldOp}. An empty init is just a YieldOp-only block.
 *   - `beforeRegion` (regions[1]) — the test. Re-entered every
 *     iteration. Terminates in a {@link ConditionOp} carrying the
 *     boolean result.
 *   - `bodyRegion` (regions[2]) — the loop body. Terminates in a
 *     {@link YieldOp} on natural fall-through, or in a
 *     `BreakOp` / `ContinueOp` / `ReturnOp` for structural exits.
 *     A `ContinueOp` inside the body targets the start of the
 *     update region.
 *   - `updateRegion` (regions[3]) — the update expression. Runs at
 *     the end of every iteration (and at every `continue`) before
 *     the test is re-evaluated. Terminates in a {@link YieldOp}.
 *
 * Every region is present, even when the source omits its
 * corresponding slot: an absent slot is represented by a region
 * whose entry block terminates in a YieldOp with no values. This
 * keeps the ForOp self-contained — a pass walking a ForOp's regions
 * sees the entire control-flow graph without peeking at the parent
 * block for init ops.
 *
 * Inline structured op — lives in its parent block, control
 * continues with the next op when the loop exits.
 */
export class ForOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.HasRegions]);

  constructor(
    id: OperationId,
    initRegion: Region,
    beforeRegion: Region,
    bodyRegion: Region,
    updateRegion: Region,
    public readonly label?: string,
  ) {
    super(id, [initRegion, beforeRegion, bodyRegion, updateRegion]);
  }

  get initRegion(): Region {
    return this.regions[0];
  }

  get beforeRegion(): Region {
    return this.regions[1];
  }

  get bodyRegion(): Region {
    return this.regions[2];
  }

  get updateRegion(): Region {
    return this.regions[3];
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
      remapRegion(ctx, this.regions[3]),
      this.label,
    );
  }

  override verify(): void {
    super.verify();
    if (this.regions.length !== 4) {
      throw new VerifyError(
        this,
        `expected 4 regions (init, before, body, update), got ${this.regions.length}`,
      );
    }
  }
}
