import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, remapBlock } from "../../core/Operation";
import {
  type CFGSuccessor,
  invalidSuccessorIndex,
  successorArgValues,
  TermOp,
  valueSuccessorArgs,
} from "../../core/TermOp";

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
export class JumpTermOp extends TermOp {
  public readonly args: readonly Value[];

  constructor(
    id: OperationId,
    public target: BasicBlock,
    args: readonly Value[] = [],
  ) {
    super(id);
    this.args = args;
  }

  operands(): Value[] {
    return [...this.args];
  }

  successorCount(): number {
    return 1;
  }

  successor(index: number): CFGSuccessor {
    if (index === 0) return { block: this.target, args: valueSuccessorArgs(this.args) };
    return invalidSuccessorIndex(this.constructor.name, index);
  }

  withSuccessor(index: number, successor: CFGSuccessor): JumpTermOp {
    if (index !== 0) return invalidSuccessorIndex(this.constructor.name, index);
    return new JumpTermOp(this.id, successor.block, successorArgValues(successor.args));
  }

  rewrite(values: Map<Value, Value>): JumpTermOp {
    if (this.args.length === 0) return this;
    let changed = false;
    const newArgs: Value[] = [];
    for (const arg of this.args) {
      const rewritten = values.get(arg) ?? arg;
      if (rewritten !== arg) changed = true;
      newArgs.push(rewritten);
    }
    if (!changed) return this;
    return new JumpTermOp(this.id, this.target, newArgs);
  }

  clone(ctx: CloneContext): JumpTermOp {
    const newArgs = this.args.map((a) => ctx.valueMap.get(a) ?? a);
    return new JumpTermOp(nextId(ctx), remapBlock(ctx, this.target), newArgs);
  }

  public override print(): string {
    if (this.args.length === 0) return `jump bb${this.target.id}`;
    const argStr = this.args.map((a) => a.print()).join(", ");
    return `jump bb${this.target.id}(${argStr})`;
  }
}
