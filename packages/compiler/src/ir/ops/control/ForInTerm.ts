import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, remapPlace, TermOp } from "../../core/Operation";

/**
 * `for (target of iterable) body` / `for await (target of ...)`.
 *
 * Lowered as a header terminator that semantically asks the iterator
 * for the next value. If exhausted → `exitBlock`; otherwise bind
 * `iterationValue` (+ destructure via `iterationTarget` in the body
 * entry), then → `bodyBlock`.
 *
 * The body's natural terminator branches back to this header to
 * request the next iteration.
 *
 * Note: the iterator protocol mechanics (calling `Symbol.iterator`,
 * invoking `.next()`, checking `.done`) are encoded implicitly by
 * codegen emitting `for (const x of iter) { ... }`. Optimization
 * passes see the header as an opaque "iterator advance + done?"
 * node.
 */
export class ForOfTermOp extends TermOp {
  constructor(
    id: OperationId,
    public readonly iterable: Value,
    public readonly iterationValue: Value,
    public bodyBlock: BasicBlock,
    public exitBlock: BasicBlock,
    public readonly isAwait: boolean,
    public readonly label?: string,
  ) {
    super(id);
  }

  operands(): Value[] {
    return [this.iterable];
  }

  override results(): Value[] {
    return [this.iterationValue];
  }

  getBlockRefs(): BasicBlock[] {
    return [this.bodyBlock, this.exitBlock];
  }

  rewrite(values: Map<Value, Value>): ForOfTermOp {
    const newIter = values.get(this.iterable) ?? this.iterable;
    if (newIter === this.iterable) return this;
    return new ForOfTermOp(
      this.id,
      newIter,
      this.iterationValue,
      this.bodyBlock,
      this.exitBlock,
      this.isAwait,
      this.label,
    );
  }

  clone(ctx: CloneContext): ForOfTermOp {
    return new ForOfTermOp(
      nextId(ctx),
      remapPlace(ctx, this.iterable),
      remapPlace(ctx, this.iterationValue),
      ctx.blockMap.get(this.bodyBlock) ?? this.bodyBlock,
      ctx.blockMap.get(this.exitBlock) ?? this.exitBlock,
      this.isAwait,
      this.label,
    );
  }
}

/**
 * `for (key in object) body`.
 *
 * Same shape as {@link ForOfTermOp} but iterates enumerable keys of
 * `object` instead of a `@@iterator` protocol.
 */
export class ForInTermOp extends TermOp {
  constructor(
    id: OperationId,
    public readonly object: Value,
    public readonly iterationValue: Value,
    public bodyBlock: BasicBlock,
    public exitBlock: BasicBlock,
    public readonly label?: string,
  ) {
    super(id);
  }

  operands(): Value[] {
    return [this.object];
  }

  override results(): Value[] {
    return [this.iterationValue];
  }

  getBlockRefs(): BasicBlock[] {
    return [this.bodyBlock, this.exitBlock];
  }

  rewrite(values: Map<Value, Value>): ForInTermOp {
    const newObj = values.get(this.object) ?? this.object;
    if (newObj === this.object) return this;
    return new ForInTermOp(
      this.id,
      newObj,
      this.iterationValue,
      this.bodyBlock,
      this.exitBlock,
      this.label,
    );
  }

  clone(ctx: CloneContext): ForInTermOp {
    return new ForInTermOp(
      nextId(ctx),
      remapPlace(ctx, this.object),
      remapPlace(ctx, this.iterationValue),
      ctx.blockMap.get(this.bodyBlock) ?? this.bodyBlock,
      ctx.blockMap.get(this.exitBlock) ?? this.exitBlock,
      this.label,
    );
  }
}
