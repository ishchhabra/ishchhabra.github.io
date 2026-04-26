import type { OperationId } from "../../core";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId } from "../../core/Operation";
import { type BlockTarget, invalidTargetIndex, TermOp } from "../../core/TermOp";

/**
 * `return;` or `return value;`. Terminator with no CFG successors.
 * Replaces `ReturnTerminal`.
 */
export class ReturnTermOp extends TermOp {
  constructor(
    id: OperationId,
    public readonly value: Value | null,
  ) {
    super(id);
  }

  operands(): Value[] {
    return this.value ? [this.value] : [];
  }

  targetCount(): number {
    return 0;
  }

  target(index: number): BlockTarget {
    return invalidTargetIndex(this.constructor.name, index);
  }

  withTarget(index: number, _successor: BlockTarget): ReturnTermOp {
    return invalidTargetIndex(this.constructor.name, index);
  }

  rewrite(values: Map<Value, Value>): ReturnTermOp {
    if (!this.value) return this;
    const value = values.get(this.value) ?? this.value;
    if (value === this.value) return this;
    return new ReturnTermOp(this.id, value);
  }

  clone(ctx: CloneContext): ReturnTermOp {
    const value = this.value === null ? null : (ctx.valueMap.get(this.value) ?? this.value);
    return new ReturnTermOp(nextId(ctx), value);
  }

  override remap(): void {}

  public override print(): string {
    return `return${this.value ? " " + this.value.print() : ""}`;
  }
}
