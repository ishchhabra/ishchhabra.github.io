import type { OperationId } from "../../core";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId } from "../../core/Operation";
import { type CFGSuccessor, invalidSuccessorIndex, TermOp } from "../../core/TermOp";

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

  successorCount(): number {
    return 0;
  }

  successor(index: number): CFGSuccessor {
    return invalidSuccessorIndex(this.constructor.name, index);
  }

  withSuccessor(index: number, _successor: CFGSuccessor): ReturnTermOp {
    return invalidSuccessorIndex(this.constructor.name, index);
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
