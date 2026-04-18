import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, Operation, Trait } from "../../core/Operation";

/**
 * Structured `continue` exit — MLIR-style structural successor.
 *
 * A `continue` (optionally `continue label`) statement re-enters the
 * closest enclosing loop's header (or the loop named by `label`).
 * Like {@link BreakOp}, this is a structural exit op whose target is
 * implied by the enclosing loop, not an arbitrary block id.
 *
 * `args` carry values flowing to the target's iter-arg sink (for a
 * while-loop: the `beforeRegion` entry's block params; for a
 * for-loop: the `updateRegion` entry's block params, since the update
 * runs before re-entering the test). Populated by `SSABuilder` when
 * the enclosing loop has loop-carried decls, and consumed by
 * `SSAEliminator` to emit `param = arg` copy stores before `continue`.
 */
export class ContinueOp extends Operation {
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

  rewrite(values: Map<Value, Value>): ContinueOp {
    if (this.args.length === 0) return this;
    let changed = false;
    const newArgs: Value[] = [];
    for (const arg of this.args) {
      const rewritten = values.get(arg) ?? arg;
      if (rewritten !== arg) changed = true;
      newArgs.push(rewritten);
    }
    if (!changed) return this;
    return new ContinueOp(this.id, this.label, newArgs);
  }

  clone(ctx: CloneContext): ContinueOp {
    const newArgs = this.args.map((a) => ctx.valueMap.get(a) ?? a);
    return new ContinueOp(nextId(ctx), this.label, newArgs);
  }

  override remap(): void {}

  override getBlockRefs(): BasicBlock[] {
    return [];
  }

  public override print(): string {
    const label = this.label ? ` ${this.label}` : "";
    if (this.args.length === 0) return `continue${label}`;
    const argStr = this.args.map((a) => a.print()).join(", ");
    return `continue${label}(${argStr})`;
  }
}
