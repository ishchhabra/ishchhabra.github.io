import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, Operation, remapBlock, Trait } from "../../core/Operation";

/**
 * Unconditional jump to a successor block. Terminator. Replaces
 * `JumpTerminal`.
 *
 * **Block arguments**: a jump may carry `args` which bind to the
 * target block's `params` at entry. Empty by default — populated by
 * `SSABuilder` at the predecessor of every merge block that the
 * classical Cytron algorithm would have placed phi operands at.
 * The lowering pass (out-of-block-args) emits the corresponding edge
 * copies before the jump.
 */
export class JumpOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  public readonly args: readonly Value[];

  constructor(
    id: OperationId,
    public target: BasicBlock,
    args: readonly Value[] = [],
  ) {
    super(id);
    this.args = args;
  }

  getOperands(): Value[] {
    return [...this.args];
  }

  rewrite(values: Map<Value, Value>): JumpOp {
    if (this.args.length === 0) return this;
    let changed = false;
    const newArgs: Value[] = [];
    for (const arg of this.args) {
      const rewritten = values.get(arg) ?? arg;
      if (rewritten !== arg) changed = true;
      newArgs.push(rewritten);
    }
    if (!changed) return this;
    return new JumpOp(this.id, this.target, newArgs);
  }

  clone(ctx: CloneContext): JumpOp {
    const newArgs = this.args.map((a) => ctx.valueMap.get(a) ?? a);
    return new JumpOp(nextId(ctx), remapBlock(ctx, this.target), newArgs);
  }

  override remap(from: BasicBlock, to: BasicBlock): void {
    if (this.target === from) this.target = to;
  }

  override getBlockRefs(): BasicBlock[] {
    return [this.target];
  }

  public override print(): string {
    if (this.args.length === 0) return `jump bb${this.target.id}`;
    const argStr = this.args.map((a) => a.print()).join(", ");
    return `jump bb${this.target.id}(${argStr})`;
  }
}
