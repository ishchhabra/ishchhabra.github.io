import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, Operation, Trait } from "../../core/Operation";

/**
 * Structured `break` — MLIR-style structural exit.
 *
 * A `break` (optionally `break label`) statement exits the closest
 * enclosing loop / switch (or the construct named by `label`). It
 * carries no explicit CFG successor: the target is the continuation
 * after the enclosing structured op, resolved at codegen time via
 * the control stack.
 *
 * `args` carry values flowing to the target's SSA merge sink (the
 * enclosing loop/switch/labeled-block's `resultPlaces`). Populated by
 * `SSABuilder` when the enclosing op has loop-carried decls, and
 * consumed by `SSAEliminator` to emit `param = arg` copy stores
 * immediately before the `break` keyword.
 */
export class BreakOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  public readonly args: readonly Value[];

  constructor(
    id: OperationId,
    public readonly label?: string,
    args: readonly Value[] = [],
  ) {
    super(id);
    this.args = args;
  }

  getOperands(): Value[] {
    return [...this.args];
  }

  rewrite(values: Map<Value, Value>): BreakOp {
    if (this.args.length === 0) return this;
    let changed = false;
    const newArgs: Value[] = [];
    for (const arg of this.args) {
      const rewritten = values.get(arg) ?? arg;
      if (rewritten !== arg) changed = true;
      newArgs.push(rewritten);
    }
    if (!changed) return this;
    return new BreakOp(this.id, this.label, newArgs);
  }

  clone(ctx: CloneContext): BreakOp {
    const newArgs = this.args.map((a) => ctx.valueMap.get(a) ?? a);
    return new BreakOp(nextId(ctx), this.label, newArgs);
  }

  override remap(): void {}

  override getBlockRefs(): BasicBlock[] {
    return [];
  }

  public override print(): string {
    const label = this.label ? ` ${this.label}` : "";
    if (this.args.length === 0) return `break${label}`;
    const argStr = this.args.map((a) => a.print()).join(", ");
    return `break${label}(${argStr})`;
  }
}
