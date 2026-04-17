import type { OperationId } from "../../core";
import type { BlockId } from "../../core/Block";
import type { Identifier } from "../../core/Identifier";
import { type CloneContext, nextId, Operation, remapPlace, Trait } from "../../core/Operation";
import type { Place } from "../../core/Place";

/**
 * Loop-condition terminator. Lives at the end of a loop op's
 * `beforeRegion`, carrying a boolean operand {@link value} that
 * determines whether the loop continues (`true`) or exits normally
 * (`false`), plus trailing {@link args} that forward loop-carried
 * SSA values along the selected edge.
 *
 * Analogous to MLIR's `scf.condition`. The before region is
 * re-entered on every iteration; its terminator yields the test
 * result back to the enclosing structured loop op ({@link WhileOp})
 * which gates the next iteration on the boolean:
 *
 *   - `true`  — the trailing args become the body region's entry
 *               block parameters for the next iteration.
 *   - `false` — the trailing args become the enclosing loop op's
 *               result places.
 *
 * The trailing args typically hold the current iteration's values
 * of every loop-carried variable. When the loop has no loop-carried
 * SSA values (i.e. the loop only mutates let vars through ordinary
 * StoreLocalOps), {@link args} is empty.
 *
 * Like {@link YieldOp}, ConditionOp does NOT name a CFG successor:
 * control returns to the enclosing loop op's continuation logic. It
 * is a structural region terminator.
 */
export class ConditionOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  public readonly args: readonly Place[];

  constructor(
    id: OperationId,
    public readonly value: Place,
    args: readonly Place[] = [],
  ) {
    super(id);
    this.args = args;
  }

  getOperands(): Place[] {
    return [this.value, ...this.args];
  }

  rewrite(values: Map<Identifier, Place>): ConditionOp {
    const next = values.get(this.value.identifier) ?? this.value;
    let argsChanged = false;
    const newArgs: Place[] = [];
    for (const arg of this.args) {
      const nextArg = values.get(arg.identifier) ?? arg;
      if (nextArg !== arg) argsChanged = true;
      newArgs.push(nextArg);
    }
    if (next === this.value && !argsChanged) return this;
    return new ConditionOp(this.id, next, argsChanged ? newArgs : this.args);
  }

  clone(ctx: CloneContext): ConditionOp {
    return new ConditionOp(
      nextId(ctx),
      remapPlace(ctx, this.value),
      this.args.map((p) => remapPlace(ctx, p)),
    );
  }

  override remap(_from: BlockId, _to: BlockId): void {
    // ConditionOp has no block refs.
  }

  override getBlockRefs(): BlockId[] {
    return [];
  }

  public override print(): string {
    if (this.args.length === 0) return `condition ${this.value.print()}`;
    return `condition ${this.value.print()} [${this.args.map((p) => p.print()).join(", ")}]`;
  }
}
