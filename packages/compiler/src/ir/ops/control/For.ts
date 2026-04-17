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
 * JS `for (init; test; update) { body }`. Distinct from
 * {@link WhileOp} because JS `continue` inside a for-loop must run
 * the `update` expression before re-evaluating the test, and
 * collapsing the body and update into one region would break
 * `continue` semantics.
 *
 * The op owns four regions, matching the four semantic slots of a
 * JS for-statement:
 *
 *   - `initRegion` (regions[0]) — init expression / declarations.
 *     Runs once, before the first iteration. Terminates in a
 *     {@link YieldOp} carrying the initial values of iter-args.
 *   - `beforeRegion` (regions[1]) — the test. Re-entered every
 *     iteration. Terminates in a {@link ConditionOp} whose args
 *     carry the current iter values to the body (true path) or
 *     to {@link resultPlaces} (false path, exit).
 *   - `bodyRegion` (regions[2]) — the loop body. Terminates in a
 *     {@link YieldOp} on natural fall-through carrying values to
 *     the update region; or `BreakOp` (→ resultPlaces) / `ContinueOp`
 *     (→ updateRegion.entry) / `ReturnOp`.
 *   - `updateRegion` (regions[3]) — the update expression. Runs at
 *     the end of every iteration (and at every `continue`) before
 *     the test is re-evaluated. Terminates in a {@link YieldOp}
 *     carrying the post-update iter values back to beforeRegion.
 *
 * `resultPlaces` receive values on the false-path of the
 * `ConditionOp` and from any `BreakOp` that targets this loop. Empty
 * when the loop has no loop-carried SSA values — a pure memory-form
 * ForOp for side-effecting for-statements.
 *
 * Inline structured op — lives in its parent block, control
 * continues with the next op when the loop exits.
 */
export class ForOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.HasRegions]);

  public readonly resultPlaces: readonly Place[];

  constructor(
    id: OperationId,
    initRegion: Region,
    beforeRegion: Region,
    bodyRegion: Region,
    updateRegion: Region,
    public readonly label?: string,
    resultPlaces: readonly Place[] = [],
  ) {
    super(id, [initRegion, beforeRegion, bodyRegion, updateRegion]);
    this.resultPlaces = resultPlaces;
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
    return [...this.resultPlaces];
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
      this.resultPlaces.map((p) => remapPlace(ctx, p)),
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
