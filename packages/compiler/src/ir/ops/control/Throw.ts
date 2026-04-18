import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, Operation, remapPlace, Trait } from "../../core/Operation";

/**
 * `throw value;`. Terminator. Control unwinds to the nearest catch
 * handler or out of the function. Replaces `ThrowTerminal`.
 */
export class ThrowOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  constructor(
    id: OperationId,
    public readonly value: Value,
  ) {
    super(id);
  }

  getOperands(): Value[] {
    return [this.value];
  }

  rewrite(values: Map<Value, Value>): ThrowOp {
    const value = values.get(this.value) ?? this.value;
    if (value === this.value) return this;
    return new ThrowOp(this.id, value);
  }

  clone(ctx: CloneContext): ThrowOp {
    return new ThrowOp(nextId(ctx), remapPlace(ctx, this.value));
  }

  override remap(): void {}

  override getBlockRefs(): BasicBlock[] {
    return [];
  }

  public override print(): string {
    return `throw ${this.value.print()}`;
  }
}
