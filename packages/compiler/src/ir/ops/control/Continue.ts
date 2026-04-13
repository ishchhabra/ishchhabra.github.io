import type { OperationId } from "../../core";
import type { BlockId } from "../../core/Block";
import type { Identifier } from "../../core/Identifier";
import { type CloneContext, nextId, Operation, Trait } from "../../core/Operation";
import type { Place } from "../../core/Place";

/**
 * Structured `continue` exit — MLIR-style structural successor.
 *
 * A `continue` (optionally `continue label`) statement re-enters the
 * closest enclosing loop's header (or the loop named by `label`).
 * Like {@link BreakOp}, this is a structural exit op whose target is
 * implied by the enclosing loop, not an arbitrary block id.
 *
 * Replaces `JumpOp(headerBlockId)` for continue statements and for the
 * natural fall-off back-edge at the end of structured loop bodies
 * (ForOf / ForIn) where the enclosing loop is itself a structured op.
 */
export class ContinueOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  constructor(
    id: OperationId,
    public readonly label?: string,
  ) {
    super(id);
  }

  getOperands(): Place[] {
    return [];
  }

  rewrite(_values: Map<Identifier, Place>): ContinueOp {
    return this;
  }

  clone(ctx: CloneContext): ContinueOp {
    return new ContinueOp(nextId(ctx), this.label);
  }

  override remap(): void {}

  override getBlockRefs(): BlockId[] {
    return [];
  }

  public override print(): string {
    return this.label ? `continue ${this.label}` : "continue";
  }
}
