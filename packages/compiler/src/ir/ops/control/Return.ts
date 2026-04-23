import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, Operation, TermOp } from "../../core/Operation";

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

  getOperands(): Value[] {
    return this.value ? [this.value] : [];
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

  override getBlockRefs(): BasicBlock[] {
    return [];
  }

  public override print(): string {
    return `return${this.value ? " " + this.value.print() : ""}`;
  }
}
