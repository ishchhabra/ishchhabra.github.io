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
 * Top-tested loop. Mirrors MLIR's `scf.while`.
 *
 * Owns two regions:
 *
 *   - `beforeRegion` (regions[0]) — the test. Re-entered on every
 *     iteration. Computes the loop condition and terminates each of
 *     its blocks in a {@link ConditionOp} carrying the boolean
 *     result.
 *   - `bodyRegion` (regions[1]) — the loop body. Runs once per
 *     iteration when the condition is `true`. Terminates in a
 *     {@link YieldOp} (or in a structural exit like `BreakOp`,
 *     `ContinueOp`, `ReturnOp`).
 *
 * Inline structured op. Lives directly in its parent block; control
 * continues with the next op in the parent block when the loop exits.
 *
 * Why the test lives inside a region instead of as a flat operand:
 * the JS `while (test) { body }` semantics require the test to be
 * evaluated on every iteration. A flat operand encodes "evaluate the
 * test once and reuse the result," which would loop forever once the
 * body mutates anything the test reads. Putting the test inside a
 * region the loop owns makes the per-iteration re-evaluation explicit
 * at the IR level.
 *
 * `do { body } while (test)` lowers via desugaring at the frontend
 * (body + `if (!test) break`) into a `while (true) { ... }` shape;
 * see {@link buildDoWhileStatement}. JS `for (init; test; update)
 * { body }` lowers to a separate {@link ForOp}, not WhileOp, because
 * the `continue` semantics differ.
 */
export class WhileOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.HasRegions]);

  constructor(
    id: OperationId,
    beforeRegion: Region,
    bodyRegion: Region,
    public readonly label?: string,
  ) {
    super(id, [beforeRegion, bodyRegion]);
  }

  get beforeRegion(): Region {
    return this.regions[0];
  }

  get bodyRegion(): Region {
    return this.regions[1];
  }

  getOperands(): Place[] {
    return [];
  }

  override getDefs(): Place[] {
    return [];
  }

  rewrite(_values: Map<Identifier, Place>): WhileOp {
    return this;
  }

  clone(ctx: CloneContext): WhileOp {
    return new WhileOp(
      nextId(ctx),
      remapRegion(ctx, this.regions[0]),
      remapRegion(ctx, this.regions[1]),
      this.label,
    );
  }

  override verify(): void {
    super.verify();
    if (this.regions.length !== 2) {
      throw new VerifyError(
        this,
        `expected 2 regions (before, body), got ${this.regions.length}`,
      );
    }
  }
}
