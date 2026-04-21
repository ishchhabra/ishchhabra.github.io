import type { OperationId } from "../../core";
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
import {
  parentExit,
  type RegionBranchOp,
  type RegionBranchPoint,
  type RegionSuccessor,
} from "../../core/RegionBranchOp";

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
export class ForOp extends Operation implements RegionBranchOp {
  static override readonly traits = new Set<Trait>([Trait.HasRegions]);

  /** Mutable — MLIR-style. */
  public resultPlaces: Value[];

  constructor(
    id: OperationId,
    initRegion: Region,
    beforeRegion: Region,
    bodyRegion: Region,
    updateRegion: Region,
    public readonly label?: string,
    resultPlaces: readonly Value[] = [],
  ) {
    super(id, [initRegion, beforeRegion, bodyRegion, updateRegion]);
    this.resultPlaces = [...resultPlaces];
  }

  setResultPlaces(places: readonly Value[]): void {
    this.resultPlaces = [...places];
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

  getOperands(): Value[] {
    return [];
  }

  override getDefs(): Value[] {
    return [...this.resultPlaces];
  }

  rewrite(_values: Map<Value, Value>): ForOp {
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

  // ------------------------------------------------------------------
  // RegionBranchOp — four-region JS for-statement, MLIR scf.for shape
  // ------------------------------------------------------------------

  getSuccessorRegions(point: RegionBranchPoint): readonly RegionSuccessor[] {
    if (point.kind === "parent") {
      // Parent enters initRegion (runs the `let i = ...` prelude).
      // No op-level operands — initial iter values come from
      // initRegion's YieldOp.
      return [{ target: this.initRegion }];
    }
    if (point.region === this.initRegion) {
      return [{ target: this.beforeRegion }];
    }
    if (point.region === this.beforeRegion) {
      // ConditionOp: true → body, false → parent-exit.
      return [{ target: this.bodyRegion }, { target: parentExit }];
    }
    if (point.region === this.bodyRegion) {
      // Body's natural YieldOp flows to updateRegion.entry.
      return [{ target: this.updateRegion }];
    }
    if (point.region === this.updateRegion) {
      // Update's YieldOp is the back-edge to beforeRegion.
      return [{ target: this.beforeRegion }];
    }
    return [];
  }

  getEntrySuccessorOperands(_successor: RegionSuccessor): readonly Value[] {
    return [];
  }
}
