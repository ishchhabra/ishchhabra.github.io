import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, remapPlace, TermOp } from "../../core/Operation";

/**
 * `try { ... } catch (e) { ... } finally { ... }`.
 *
 * Lowered as a header terminator that transfers control to
 * `bodyBlock`. Any throwable op inside the try-body — both explicit
 * `throw` and implicit exception edges from calls — can route to
 * `handlerBlock` (for `catch`) or bypass straight to `finallyBlock`
 * (when no handler is present). After either arm completes, control
 * reaches `fallthroughBlock`.
 *
 * The handler's catch parameter (`handlerParam`, if present) is
 * bound on entry to `handlerBlock` — modeled as a block entry
 * binding rather than a block param because it's supplied by the
 * JS exception-throw mechanism, not by explicit operand forwarding.
 */
export class TryTermOp extends TermOp {
  constructor(
    id: OperationId,
    public bodyBlock: BasicBlock,
    public handlerBlock: BasicBlock | null,
    public handlerParam: Value | null,
    public finallyBlock: BasicBlock | null,
    public fallthroughBlock: BasicBlock,
  ) {
    super(id);
  }

  getOperands(): Value[] {
    return [];
  }

  getBlockRefs(): BasicBlock[] {
    const refs: BasicBlock[] = [this.bodyBlock];
    if (this.handlerBlock !== null) refs.push(this.handlerBlock);
    if (this.finallyBlock !== null) refs.push(this.finallyBlock);
    refs.push(this.fallthroughBlock);
    return refs;
  }

  getDefs(): Value[] {
    return this.handlerParam !== null ? [this.handlerParam] : [];
  }

  rewrite(_values: Map<Value, Value>): TryTermOp {
    return this;
  }

  clone(ctx: CloneContext): TryTermOp {
    return new TryTermOp(
      nextId(ctx),
      ctx.blockMap.get(this.bodyBlock) ?? this.bodyBlock,
      this.handlerBlock === null
        ? null
        : (ctx.blockMap.get(this.handlerBlock) ?? this.handlerBlock),
      this.handlerParam === null ? null : remapPlace(ctx, this.handlerParam),
      this.finallyBlock === null
        ? null
        : (ctx.blockMap.get(this.finallyBlock) ?? this.finallyBlock),
      ctx.blockMap.get(this.fallthroughBlock) ?? this.fallthroughBlock,
    );
  }
}
