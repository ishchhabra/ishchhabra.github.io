import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, remapPlace, TermOp } from "../../core/Operation";

/**
 * Loop header for `while (cond) body` and `do body while (cond)`.
 *
 * `kind = "while"` evaluates `cond` before entering the body (the
 * block hosting this terminator IS the loop header); `kind =
 * "do-while"` semantically evaluates after the body, but lowered
 * with the same structure — the frontend arranges the CFG so the
 * first iteration enters `bodyBlock` unconditionally and subsequent
 * iterations pass through here.
 *
 * On each iteration: if `cond` is truthy → `bodyBlock`, else →
 * `exitBlock`. The body block's terminator branches back to this
 * header (forming the back-edge). Loop-carried values flow through
 * block parameters on the header (standard CFG SSA — no iter-args
 * machinery).
 */
export class WhileTermOp extends TermOp {
  constructor(
    id: OperationId,
    public readonly cond: Value,
    public bodyBlock: BasicBlock,
    public exitBlock: BasicBlock,
    public readonly kind: "while" | "do-while",
    public readonly label?: string,
  ) {
    super(id);
  }

  getOperands(): Value[] {
    return [this.cond];
  }

  getBlockRefs(): BasicBlock[] {
    return [this.bodyBlock, this.exitBlock];
  }

  rewrite(values: Map<Value, Value>): WhileTermOp {
    const newCond = values.get(this.cond) ?? this.cond;
    if (newCond === this.cond) return this;
    return new WhileTermOp(this.id, newCond, this.bodyBlock, this.exitBlock, this.kind, this.label);
  }

  clone(ctx: CloneContext): WhileTermOp {
    return new WhileTermOp(
      nextId(ctx),
      remapPlace(ctx, this.cond),
      ctx.blockMap.get(this.bodyBlock) ?? this.bodyBlock,
      ctx.blockMap.get(this.exitBlock) ?? this.exitBlock,
      this.kind,
      this.label,
    );
  }
}
