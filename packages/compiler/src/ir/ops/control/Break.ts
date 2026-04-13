import type { OperationId } from "../../core";
import type { BlockId } from "../../core/Block";
import type { Identifier } from "../../core/Identifier";
import { type CloneContext, nextId, Operation, Trait } from "../../core/Operation";
import type { Place } from "../../core/Place";

/**
 * Structured `break` exit — MLIR-style structural successor.
 *
 * A `break` (optionally `break label`) statement breaks out of the
 * closest enclosing loop / switch (or the construct named by `label`)
 * to its fallthrough. In MLIR / Cranelift terms this is a structural
 * exit op whose target is the enclosing structured op's fallthrough,
 * not an arbitrary block id — so it carries no CFG successor and is
 * resolved by the codegen using the enclosing-construct stack.
 *
 * Replaces `JumpOp(exitBlockId)` for break statements. Unlike a
 * raw `JumpOp`, a `BreakOp` cannot dangle across region boundaries —
 * its semantics are tied to the enclosing structured op.
 */
export class BreakOp extends Operation {
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

  rewrite(_values: Map<Identifier, Place>): BreakOp {
    return this;
  }

  clone(ctx: CloneContext): BreakOp {
    return new BreakOp(nextId(ctx), this.label);
  }

  override remap(): void {}

  override getBlockRefs(): BlockId[] {
    return [];
  }

  public override print(): string {
    return this.label ? `break ${this.label}` : "break";
  }
}
