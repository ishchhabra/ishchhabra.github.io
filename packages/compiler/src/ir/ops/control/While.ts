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
 * Top-tested loop with loop-carried SSA values. Mirrors MLIR's `scf.while`.
 *
 * Owns two regions:
 *
 *   - `beforeRegion` (regions[0]) — the test. Re-entered on every
 *     iteration. Computes the loop condition and terminates each of
 *     its blocks in a {@link ConditionOp} carrying the boolean
 *     result plus trailing {@link ConditionOp.args} that forward to
 *     either the body (on `true`) or out as the WhileOp's results
 *     (on `false`).
 *   - `bodyRegion` (regions[1]) — the loop body. Runs once per
 *     iteration when the condition is `true`. Terminates in a
 *     {@link YieldOp} (or in a structural exit like `BreakOp`,
 *     `ContinueOp`, `ReturnOp`). The yield's values become the next
 *     iteration's block-param arguments on the before-region entry
 *     block.
 *
 * Loop-carried SSA values are expressed via three ports plus the
 * region entry-block parameters:
 *
 *   1. {@link inits} — initial values passed from the enclosing
 *      scope. Bound to `beforeRegion.blocks[0].params` on the first
 *      iteration.
 *   2. `beforeRegion.blocks[0].params` — block parameters that
 *      receive the current iteration's values (from `inits` on the
 *      first iteration, from the body's yield on subsequent
 *      iterations).
 *   3. {@link ConditionOp.args} — trailing operands of the
 *      terminating ConditionOp in the before region. On `true`, they
 *      become `bodyRegion.blocks[0].params`. On `false`, they become
 *      the WhileOp's {@link resultPlaces}.
 *   4. {@link YieldOp.values} at the body's natural exit — feed back
 *      as the next iteration's `beforeRegion.blocks[0].params`.
 *   5. {@link resultPlaces} — SSA values produced by the op to the
 *      enclosing scope when the loop exits. Bound to the condition's
 *      trailing args on the `false` iteration.
 *
 * Type-cycle invariant (all must match in count and Place types):
 *
 *     inits.length
 *   = beforeRegion.blocks[0].params.length
 *   = ConditionOp.args.length
 *   = bodyRegion.blocks[0].params.length
 *   = YieldOp.values.length at body fall-through
 *   = resultPlaces.length
 *
 * When `inits` is empty, the op degenerates to a plain memory-form
 * loop (no loop-carried SSA values).
 *
 * Inline structured op. Lives directly in its parent block; control
 * continues with the next op in the parent block when the loop exits.
 *
 * `do { body } while (test)` lowers via desugaring at the frontend
 * (body + `if (!test) break`) into a `while (true) { ... }` shape;
 * see {@link buildDoWhileStatement}. JS `for (init; test; update)
 * { body }` lowers to a separate {@link ForOp}, not WhileOp, because
 * the `continue` semantics differ.
 */
export class WhileOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.HasRegions]);

  public readonly inits: readonly Place[];
  public readonly resultPlaces: readonly Place[];

  constructor(
    id: OperationId,
    beforeRegion: Region,
    bodyRegion: Region,
    public readonly label?: string,
    inits: readonly Place[] = [],
    resultPlaces: readonly Place[] = [],
  ) {
    super(id, [beforeRegion, bodyRegion]);
    this.inits = inits;
    this.resultPlaces = resultPlaces;
  }

  get beforeRegion(): Region {
    return this.regions[0];
  }

  get bodyRegion(): Region {
    return this.regions[1];
  }

  getOperands(): Place[] {
    return [...this.inits];
  }

  override getDefs(): Place[] {
    return [...this.resultPlaces];
  }

  rewrite(values: Map<Identifier, Place>): WhileOp {
    let changed = false;
    const newInits: Place[] = [];
    for (const init of this.inits) {
      const next = values.get(init.identifier) ?? init;
      if (next !== init) changed = true;
      newInits.push(next);
    }
    if (!changed) return this;
    return new WhileOp(
      this.id,
      this.regions[0],
      this.regions[1],
      this.label,
      newInits,
      this.resultPlaces,
    );
  }

  clone(ctx: CloneContext): WhileOp {
    return new WhileOp(
      nextId(ctx),
      remapRegion(ctx, this.regions[0]),
      remapRegion(ctx, this.regions[1]),
      this.label,
      this.inits.map((p) => remapPlace(ctx, p)),
      this.resultPlaces.map((p) => remapPlace(ctx, p)),
    );
  }

  override verify(): void {
    super.verify();
    if (this.regions.length !== 2) {
      throw new VerifyError(this, `expected 2 regions (before, body), got ${this.regions.length}`);
    }
    if (this.inits.length !== this.resultPlaces.length) {
      throw new VerifyError(
        this,
        `inits (${this.inits.length}) and resultPlaces (${this.resultPlaces.length}) must have equal length`,
      );
    }
  }
}
