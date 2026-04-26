import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, remapPlace } from "../../core/Operation";
import {
  assertNoTargetArgs,
  type ControlFlowFacts,
  type BlockTarget,
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
    public thenBlock: BasicBlock,
    public elseBlock: BasicBlock,
    public fallthroughBlock: BasicBlock,
  ) {
    super(id);
  }

  operands(): Value[] {
    return [this.cond];
  }

  targetCount(): number {
    return 3;
  }

  target(index: number): BlockTarget {
    if (index === 0) return { block: this.thenBlock, args: [] };
    if (index === 1) return { block: this.elseBlock, args: [] };
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
    assertNoTargetArgs(this.constructor.name, successor);
    if (index === 0) {
      return new IfTermOp(
        this.id,
        this.cond,
        successor.block,
        this.elseBlock,
        this.fallthroughBlock,
      );
    }
    if (index === 1) {
      return new IfTermOp(
        this.id,
        this.cond,
        this.thenBlock,
        successor.block,
        this.fallthroughBlock,
      );
    }
    if (index === 2) {
      return new IfTermOp(this.id, this.cond, this.thenBlock, this.elseBlock, successor.block);
    }
    return invalidTargetIndex(this.constructor.name, index);
  }

  rewrite(values: Map<Value, Value>): IfTermOp {
    const newCond = values.get(this.cond) ?? this.cond;
    if (newCond === this.cond) return this;
    return new IfTermOp(this.id, newCond, this.thenBlock, this.elseBlock, this.fallthroughBlock);
  }

  clone(ctx: CloneContext): IfTermOp {
    return new IfTermOp(
      nextId(ctx),
      remapPlace(ctx, this.cond),
      ctx.blockMap.get(this.thenBlock) ?? this.thenBlock,
      ctx.blockMap.get(this.elseBlock) ?? this.elseBlock,
      ctx.blockMap.get(this.fallthroughBlock) ?? this.fallthroughBlock,
    );
  }
}
