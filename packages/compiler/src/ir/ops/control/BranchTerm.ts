import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, remapPlace } from "../../core/Operation";
import { type CFGSuccessor, invalidSuccessorIndex, TermOp } from "../../core/TermOp";

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
  public readonly trueArgs: readonly Value[];
  public readonly falseArgs: readonly Value[];

  constructor(
    id: OperationId,
    public readonly cond: Value,
    public trueTarget: BasicBlock,
    public falseTarget: BasicBlock,
    trueArgs: readonly Value[] = [],
    falseArgs: readonly Value[] = [],
  ) {
    super(id);
    this.trueArgs = trueArgs;
    this.falseArgs = falseArgs;
  }

  operands(): Value[] {
    return [this.cond, ...this.trueArgs, ...this.falseArgs];
  }

  successorCount(): number {
    return 2;
  }

  successor(index: number): CFGSuccessor {
    if (index === 0) return { block: this.trueTarget, args: this.trueArgs };
    if (index === 1) return { block: this.falseTarget, args: this.falseArgs };
    return invalidSuccessorIndex(this.constructor.name, index);
  }

  withSuccessor(index: number, successor: CFGSuccessor): BranchTermOp {
    if (index === 0) {
      return new BranchTermOp(
        this.id,
        this.cond,
        successor.block,
        this.falseTarget,
        successor.args,
        this.falseArgs,
      );
    }
    if (index === 1) {
      return new BranchTermOp(
        this.id,
        this.cond,
        this.trueTarget,
        successor.block,
        this.trueArgs,
        successor.args,
      );
    }
    return invalidSuccessorIndex(this.constructor.name, index);
  }

  rewrite(values: Map<Value, Value>): BranchTermOp {
    const newCond = values.get(this.cond) ?? this.cond;
    let changed = newCond !== this.cond;
    const newTrue = this.trueArgs.map((a) => {
      const r = values.get(a) ?? a;
      if (r !== a) changed = true;
      return r;
    });
    const newFalse = this.falseArgs.map((a) => {
      const r = values.get(a) ?? a;
      if (r !== a) changed = true;
      return r;
    });
    if (!changed) return this;
    return new BranchTermOp(this.id, newCond, this.trueTarget, this.falseTarget, newTrue, newFalse);
  }

  clone(ctx: CloneContext): BranchTermOp {
    return new BranchTermOp(
      nextId(ctx),
      remapPlace(ctx, this.cond),
      ctx.blockMap.get(this.trueTarget) ?? this.trueTarget,
      ctx.blockMap.get(this.falseTarget) ?? this.falseTarget,
      this.trueArgs.map((a) => ctx.valueMap.get(a) ?? a),
      this.falseArgs.map((a) => ctx.valueMap.get(a) ?? a),
    );
  }

  public override print(): string {
    const fmtArgs = (args: readonly Value[]): string =>
      args.length === 0 ? "" : `(${args.map((a) => a.print()).join(", ")})`;
    return `branch ${this.cond.print()} ? bb${this.trueTarget.id}${fmtArgs(this.trueArgs)} : bb${this.falseTarget.id}${fmtArgs(this.falseArgs)}`;
  }
}
