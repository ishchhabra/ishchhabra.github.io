import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, Operation, remapPlace, Trait } from "../../core/Operation";

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

  public readonly args: readonly Value[];

  constructor(
    id: OperationId,
    public readonly value: Value,
    args: readonly Value[] = [],
  ) {
    super(id);
    this.args = args;
  }

  getOperands(): Value[] {
    return [this.value, ...this.args];
  }

  rewrite(values: Map<Value, Value>): ConditionOp {
    const next = values.get(this.value) ?? this.value;
    let argsChanged = false;
    const newArgs: Value[] = [];
    for (const arg of this.args) {
      const nextArg = values.get(arg) ?? arg;
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

  override remap(_from: BasicBlock, _to: BasicBlock): void {
    // ConditionOp has no block refs.
  }

  override getBlockRefs(): BasicBlock[] {
    return [];
  }

  public override print(): string {
    if (this.args.length === 0) return `condition ${this.value.print()}`;
    return `condition ${this.value.print()} [${this.args.map((p) => p.print()).join(", ")}]`;
  }
}
