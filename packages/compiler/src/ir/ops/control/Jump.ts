import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId } from "../../core/Operation";
import {
  type BlockTarget,
  invalidTargetIndex,
  type SuccessorArg,
  successorArgValue,
  TermOp,
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
  public readonly jumpTarget: BlockTarget;

  constructor(id: OperationId, target: BlockTarget) {
    super(id);
    this.jumpTarget = target;
  }

  get targetBlock(): BasicBlock {
    return this.jumpTarget.block;
  }

  get args(): readonly Value[] {
    return this.jumpTarget.args.map(successorArgValue);
  }

  operands(): Value[] {
    return [...this.args];
  }

  targetCount(): number {
    return 1;
  }

  target(index: number): BlockTarget {
    if (index === 0) return this.jumpTarget;
    return invalidTargetIndex(this.constructor.name, index);
  }

  withTarget(index: number, successor: BlockTarget): JumpTermOp {
    if (index !== 0) return invalidTargetIndex(this.constructor.name, index);
    return new JumpTermOp(this.id, successor);
  }

  rewrite(values: Map<Value, Value>): JumpTermOp {
    if (this.jumpTarget.args.length === 0) return this;
    let changed = false;
    const newArgs = rewriteSuccessorArgs(this.jumpTarget.args, values, () => {
      changed = true;
    });
    if (!changed) return this;
    return new JumpTermOp(this.id, { block: this.targetBlock, args: newArgs });
  }

  clone(ctx: CloneContext): JumpTermOp {
    return new JumpTermOp(nextId(ctx), cloneTarget(ctx, this.jumpTarget));
  }

  public override print(): string {
    if (this.args.length === 0) return `jump bb${this.targetBlock.id}`;
    const argStr = this.args.map((a) => a.print()).join(", ");
    return `jump bb${this.targetBlock.id}(${argStr})`;
  }
}

function rewriteSuccessorArgs(
  args: readonly SuccessorArg[],
  values: Map<Value, Value>,
  onChanged: () => void,
): SuccessorArg[] {
  return args.map((arg) => {
    const rewritten = values.get(arg.value) ?? arg.value;
    if (rewritten === arg.value) return arg;
    onChanged();
    return { ...arg, value: rewritten };
  });
}

function cloneTarget(ctx: CloneContext, target: BlockTarget): BlockTarget {
  return {
    block: ctx.blockMap.get(target.block) ?? target.block,
    args: target.args.map((arg) => ({
      ...arg,
      value: ctx.valueMap.get(arg.value) ?? arg.value,
    })),
  };
}
