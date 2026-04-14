import type { OperationId } from "../../core";
import type { BlockId } from "../../core/Block";
import type { Identifier } from "../../core/Identifier";
import { type CloneContext, nextId, Operation, Trait } from "../../core/Operation";
import type { Place } from "../../core/Place";

/**
 * Structured `break` — MLIR-style structural exit.
 *
 * A `break` (optionally `break label`) statement exits the closest
 * enclosing loop / switch (or the construct named by `label`). It
 * carries no explicit CFG successor: the target is the continuation
 * after the enclosing structured op, resolved at codegen time via
 * the control stack.
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
