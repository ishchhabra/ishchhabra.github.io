import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, remapPlace } from "../../core/Operation";
import {
  type ControlFlowFacts,
  type BlockTarget,
  invalidTargetIndex,
  type SuccessorArg,
  successorArgValue,
  TermOp,
} from "../../core/TermOp";

/**
 * Two-way branch used to terminate a loop's test block:
 *
 *   if (cond) → trueTarget(trueArgs) else → falseTarget(falseArgs)
 *
 * Distinct from {@link IfTermOp} in that there is no `fallthroughBlock`
 * join point — both arms are true successor edges. Primarily used by
 * {@link WhileTermOp}/{@link ForTermOp} to terminate their `testBlock`:
 * `trueTarget = bodyBlock`, `falseTarget = exitBlock`.
 *
 * **Block arguments**: like {@link JumpTermOp} each arm carries
 * positional `args` bound to the target block's `params` at entry.
 * Populated by `SSABuilder` at any predecessor of a merge block that
 * the classical Cytron algorithm would have placed phi operands at.
 */
export class BranchTermOp extends TermOp {
  public readonly trueBranchTarget: BlockTarget;
  public readonly falseBranchTarget: BlockTarget;

  constructor(
    id: OperationId,
    public readonly cond: Value,
    trueTarget: BlockTarget,
    falseTarget: BlockTarget,
  ) {
    super(id);
    this.trueBranchTarget = trueTarget;
    this.falseBranchTarget = falseTarget;
  }

  get trueTarget(): BasicBlock {
    return this.trueBranchTarget.block;
  }

  get falseTarget(): BasicBlock {
    return this.falseBranchTarget.block;
  }

  get trueArgs(): readonly Value[] {
    return this.trueBranchTarget.args.map(successorArgValue);
  }

  get falseArgs(): readonly Value[] {
    return this.falseBranchTarget.args.map(successorArgValue);
  }

  operands(): Value[] {
    return [this.cond, ...this.trueArgs, ...this.falseArgs];
  }

  targetCount(): number {
    return 2;
  }

  target(index: number): BlockTarget {
    if (index === 0) return this.trueBranchTarget;
    if (index === 1) return this.falseBranchTarget;
    return invalidTargetIndex(this.constructor.name, index);
  }

  override takenSuccessorIndices(facts: ControlFlowFacts): readonly number[] {
    const cond = facts.truthiness(this.cond);
    if (cond === "pending") return [];
    if (cond === "unknown") return [0, 1];
    return cond ? [0] : [1];
  }

  withTarget(index: number, successor: BlockTarget): BranchTermOp {
    if (index === 0) {
      return new BranchTermOp(this.id, this.cond, successor, this.falseBranchTarget);
    }
    if (index === 1) {
      return new BranchTermOp(this.id, this.cond, this.trueBranchTarget, successor);
    }
    return invalidTargetIndex(this.constructor.name, index);
  }

  rewrite(values: Map<Value, Value>): BranchTermOp {
    const newCond = values.get(this.cond) ?? this.cond;
    let changed = newCond !== this.cond;
    const newTrue = rewriteSuccessorArgs(this.trueBranchTarget.args, values, () => {
      changed = true;
    });
    const newFalse = rewriteSuccessorArgs(this.falseBranchTarget.args, values, () => {
      changed = true;
    });
    if (!changed) return this;
    return new BranchTermOp(
      this.id,
      newCond,
      { block: this.trueTarget, args: newTrue },
      { block: this.falseTarget, args: newFalse },
    );
  }

  clone(ctx: CloneContext): BranchTermOp {
    return new BranchTermOp(
      nextId(ctx),
      remapPlace(ctx, this.cond),
      cloneTarget(ctx, this.trueBranchTarget),
      cloneTarget(ctx, this.falseBranchTarget),
    );
  }

  public override print(): string {
    const fmtArgs = (args: readonly Value[]): string =>
      args.length === 0 ? "" : `(${args.map((a) => a.print()).join(", ")})`;
    return `branch ${this.cond.print()} ? bb${this.trueTarget.id}${fmtArgs(this.trueArgs)} : bb${this.falseTarget.id}${fmtArgs(this.falseArgs)}`;
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
