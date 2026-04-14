import type { OperationId } from "../../core";
import type { BlockId } from "../../core/Block";
import type { Identifier } from "../../core/Identifier";
import {
  type CloneContext,
  nextId,
  Operation,
  remapPlace,
  Trait,
} from "../../core/Operation";
import type { Place } from "../../core/Place";

/**
 * Loop-condition terminator. Lives at the end of a loop op's
 * `beforeRegion`, carrying a single boolean operand that determines
 * whether the loop continues (`true`) or exits normally (`false`).
 *
 * Analogous to MLIR's `scf.condition`. The before region is re-entered
 * on every iteration; its terminator yields the test result back to
 * the enclosing structured loop op (`WhileOp`, `ForOp`, etc.) which
 * gates the next iteration on the boolean.
 *
 * Like {@link YieldOp}, ConditionOp does NOT name a CFG successor:
 * control returns to the enclosing loop op's continuation logic. It
 * is a structural region terminator.
 */
export class ConditionOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  constructor(
    id: OperationId,
    public readonly value: Place,
  ) {
    super(id);
  }

  getOperands(): Place[] {
    return [this.value];
  }

  rewrite(values: Map<Identifier, Place>): ConditionOp {
    const next = values.get(this.value.identifier) ?? this.value;
    if (next === this.value) return this;
    return new ConditionOp(this.id, next);
  }

  clone(ctx: CloneContext): ConditionOp {
    return new ConditionOp(nextId(ctx), remapPlace(ctx, this.value));
  }

  override remap(_from: BlockId, _to: BlockId): void {
    // ConditionOp has no block refs.
  }

  override getBlockRefs(): BlockId[] {
    return [];
  }

  public override print(): string {
    return `condition ${this.value.print()}`;
  }
}
