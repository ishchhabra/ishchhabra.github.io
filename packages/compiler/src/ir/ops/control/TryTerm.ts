import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, remapPlace } from "../../core/Operation";
import {
  assertNoSuccessorArgs,
  type CFGSuccessor,
  invalidSuccessorIndex,
  TermOp,
} from "../../core/TermOp";

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

  operands(): Value[] {
    return [];
  }

  successorCount(): number {
    return 2 + (this.handlerBlock === null ? 0 : 1) + (this.finallyBlock === null ? 0 : 1);
  }

  successor(index: number): CFGSuccessor {
    const block = this.successorBlock(index);
    return { block, args: [] };
  }

  withSuccessor(index: number, successor: CFGSuccessor): TryTermOp {
    assertNoSuccessorArgs(this.constructor.name, successor);
    this.successorBlock(index);
    let bodyBlock = this.bodyBlock;
    let handlerBlock = this.handlerBlock;
    let finallyBlock = this.finallyBlock;
    let fallthroughBlock = this.fallthroughBlock;

    let nextIndex = 0;
    if (index === nextIndex++) bodyBlock = successor.block;
    if (handlerBlock !== null && index === nextIndex++) handlerBlock = successor.block;
    if (finallyBlock !== null && index === nextIndex++) finallyBlock = successor.block;
    if (index === nextIndex) fallthroughBlock = successor.block;

    return new TryTermOp(
      this.id,
      bodyBlock,
      handlerBlock,
      this.handlerParam,
      finallyBlock,
      fallthroughBlock,
    );
  }

  results(): Value[] {
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

  private successorBlock(index: number): BasicBlock {
    let nextIndex = 0;
    if (index === nextIndex++) return this.bodyBlock;
    if (this.handlerBlock !== null && index === nextIndex++) return this.handlerBlock;
    if (this.finallyBlock !== null && index === nextIndex++) return this.finallyBlock;
    if (index === nextIndex) return this.fallthroughBlock;
    return invalidSuccessorIndex(this.constructor.name, index);
  }
}
