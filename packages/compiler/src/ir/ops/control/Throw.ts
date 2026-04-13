import type { OperationId } from "../../core";
import type { BlockId } from "../../core/Block";
import type { Identifier } from "../../core/Identifier";
import { type CloneContext, nextId, Operation, remapPlace, Trait } from "../../core/Operation";
import type { Place } from "../../core/Place";

/**
 * `throw value;`. Terminator. Control unwinds to the nearest catch
 * handler or out of the function. Replaces `ThrowTerminal`.
 */
export class ThrowOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  constructor(
    id: OperationId,
    public readonly value: Place,
  ) {
    super(id);
  }

  getOperands(): Place[] {
    return [this.value];
  }

  rewrite(values: Map<Identifier, Place>): ThrowOp {
    const value = values.get(this.value.identifier) ?? this.value;
    if (value === this.value) return this;
    return new ThrowOp(this.id, value);
  }

  clone(ctx: CloneContext): ThrowOp {
    return new ThrowOp(nextId(ctx), remapPlace(ctx, this.value));
  }

  override remap(): void {}

  override getBlockRefs(): BlockId[] {
    return [];
  }

  public override print(): string {
    return `throw ${this.value.print()}`;
  }
}
