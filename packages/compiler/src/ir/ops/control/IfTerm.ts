import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, remapPlace, TermOp } from "../../core/Operation";

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

  getBlockRefs(): BasicBlock[] {
    return [this.thenBlock, this.elseBlock, this.fallthroughBlock];
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
