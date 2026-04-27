import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, remapPlace } from "../../core/Operation";
import {
  assertNoTargetArgs,
  type ControlFlowFacts,
  type BlockTarget,
  type SuccessorArg,
  invalidTargetIndex,
  TermOp,
} from "../../core/TermOp";

/**
 * Two-way branch on a boolean-ish value.
 *
 *   if (cond) thenBlock else elseBlock
 *
 * `thenBlock` and `elseBlock` are sibling blocks in the enclosing
 * function body. Control rejoins at whatever block the two arms
 * branch to (typically via a plain `JumpTermOp` to a shared fallthrough
 * block). If the conditional is used as an expression, the
 * fallthrough block has a block parameter that receives the
 * expression value from each arm.
 *
 * `elseBlock` is required — the frontend synthesizes an empty block
 * that jumps directly to the fallthrough when there's no source
 * `else` clause.
 */
export class IfTermOp extends TermOp {
  constructor(
    id: OperationId,
    public readonly cond: Value,
    public readonly thenTarget: BlockTarget,
    public readonly elseTarget: BlockTarget,
    public fallthroughBlock: BasicBlock,
  ) {
    super(id);
  }

  get thenBlock(): BasicBlock {
    return this.thenTarget.block;
  }

  get elseBlock(): BasicBlock {
    return this.elseTarget.block;
  }

  operands(): Value[] {
    return [
      this.cond,
      ...this.thenTarget.args.map((arg) => arg.value),
      ...this.elseTarget.args.map((arg) => arg.value),
    ];
  }

  targetCount(): number {
    return 3;
  }

  target(index: number): BlockTarget {
    if (index === 0) return this.thenTarget;
    if (index === 1) return this.elseTarget;
    if (index === 2) return { block: this.fallthroughBlock, args: [] };
    return invalidTargetIndex(this.constructor.name, index);
  }

  override successorIndices(): readonly number[] {
    return [0, 1];
  }

  override takenSuccessorIndices(facts: ControlFlowFacts): readonly number[] {
    const cond = facts.truthiness(this.cond);
    if (cond === "pending") return [];
    if (cond === "unknown") return this.successorIndices();
    return cond ? [0] : [1];
  }

  withTarget(index: number, successor: BlockTarget): IfTermOp {
    if (index === 0) {
      return new IfTermOp(this.id, this.cond, successor, this.elseTarget, this.fallthroughBlock);
    }
    if (index === 1) {
      return new IfTermOp(this.id, this.cond, this.thenTarget, successor, this.fallthroughBlock);
    }
    if (index === 2) {
      assertNoTargetArgs(this.constructor.name, successor);
      return new IfTermOp(
        this.id,
        this.cond,
        this.thenTarget,
        this.elseTarget,
        successor.block,
      );
    }
    return invalidTargetIndex(this.constructor.name, index);
  }

  rewrite(values: Map<Value, Value>): IfTermOp {
    const newCond = values.get(this.cond) ?? this.cond;
    let changed = newCond !== this.cond;
    const rewriteArgs = (args: readonly SuccessorArg[]): SuccessorArg[] =>
      args.map((arg) => {
        const rewritten = values.get(arg.value) ?? arg.value;
        if (rewritten === arg.value) return arg;
        changed = true;
        return { ...arg, value: rewritten };
      });
    const newThen = rewriteArgs(this.thenTarget.args);
    const newElse = rewriteArgs(this.elseTarget.args);
    if (!changed) return this;
    return new IfTermOp(
      this.id,
      newCond,
      { block: this.thenBlock, args: newThen },
      { block: this.elseBlock, args: newElse },
      this.fallthroughBlock,
    );
  }

  clone(ctx: CloneContext): IfTermOp {
    const cloneTarget = (target: BlockTarget): BlockTarget => ({
      block: ctx.blockMap.get(target.block) ?? target.block,
      args: target.args.map((arg) => ({
        ...arg,
        value: ctx.valueMap.get(arg.value) ?? arg.value,
      })),
    });
    return new IfTermOp(
      nextId(ctx),
      remapPlace(ctx, this.cond),
      cloneTarget(this.thenTarget),
      cloneTarget(this.elseTarget),
      ctx.blockMap.get(this.fallthroughBlock) ?? this.fallthroughBlock,
    );
  }
}
