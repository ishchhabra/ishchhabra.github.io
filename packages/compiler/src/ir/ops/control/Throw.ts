import type { OperationId } from "../../core";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, remapPlace } from "../../core/Operation";
import { type CFGSuccessor, invalidSuccessorIndex, TermOp } from "../../core/TermOp";

/**
 * `throw value;`. Terminator. Control unwinds to the nearest catch
 * handler or out of the function. Replaces `ThrowTerminal`.
 */
export class ThrowTermOp extends TermOp {
  constructor(
    id: OperationId,
    public readonly value: Value,
  ) {
    super(id);
  }

  operands(): Value[] {
    return [this.value];
  }

  successorCount(): number {
    return 0;
  }

  successor(index: number): CFGSuccessor {
    return invalidSuccessorIndex(this.constructor.name, index);
  }

  withSuccessor(index: number, _successor: CFGSuccessor): ThrowTermOp {
    return invalidSuccessorIndex(this.constructor.name, index);
  }

  rewrite(values: Map<Value, Value>): ThrowTermOp {
    const value = values.get(this.value) ?? this.value;
    if (value === this.value) return this;
    return new ThrowTermOp(this.id, value);
  }

  clone(ctx: CloneContext): ThrowTermOp {
    return new ThrowTermOp(nextId(ctx), remapPlace(ctx, this.value));
  }

  override remap(): void {}

  public override print(): string {
    return `throw ${this.value.print()}`;
  }
}
