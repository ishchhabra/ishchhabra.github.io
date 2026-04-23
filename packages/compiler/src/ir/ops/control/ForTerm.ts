import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, remapPlace, TermOp } from "../../core/Operation";

/**
 * C-style for-loop header terminator.
 *
 * The init section runs before control reaches the header (it's
 * lowered as ordinary ops in the predecessor block). The header
 * evaluates `cond`: truthy → `bodyBlock`, falsey → `exitBlock`. The
 * body's natural terminator branches to `updateBlock` (where the
 * `update` clause's ops live), which then branches back to this
 * header.
 *
 * Break / continue are handled by the frontend emitting jumps
 * directly to `exitBlock` / `updateBlock` respectively.
 */
export class ForTermOp extends TermOp {
  constructor(
    id: OperationId,
    public readonly cond: Value,
    public bodyBlock: BasicBlock,
    public updateBlock: BasicBlock,
    public exitBlock: BasicBlock,
    public readonly label?: string,
  ) {
    super(id);
  }

  getOperands(): Value[] {
    return [this.cond];
  }

  getBlockRefs(): BasicBlock[] {
    return [this.bodyBlock, this.updateBlock, this.exitBlock];
  }

  rewrite(values: Map<Value, Value>): ForTermOp {
    const newCond = values.get(this.cond) ?? this.cond;
    if (newCond === this.cond) return this;
    return new ForTermOp(
      this.id,
      newCond,
      this.bodyBlock,
      this.updateBlock,
      this.exitBlock,
      this.label,
    );
  }

  clone(ctx: CloneContext): ForTermOp {
    return new ForTermOp(
      nextId(ctx),
      remapPlace(ctx, this.cond),
      ctx.blockMap.get(this.bodyBlock) ?? this.bodyBlock,
      ctx.blockMap.get(this.updateBlock) ?? this.updateBlock,
      ctx.blockMap.get(this.exitBlock) ?? this.exitBlock,
      this.label,
    );
  }
}
