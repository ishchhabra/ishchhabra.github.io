import type { OperationId } from "../../core";
import type { BlockId } from "../../core/Block";
import type { Identifier } from "../../core/Identifier";
import { type CloneContext, nextId, Operation, Trait } from "../../core/Operation";
import type { Place } from "../../core/Place";

/**
 * `return;` or `return value;`. Terminator with no CFG successors.
 * Replaces `ReturnTerminal`.
 */
export class ReturnOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  constructor(
    id: OperationId,
    public readonly value: Place | null,
  ) {
    super(id);
  }

  getOperands(): Place[] {
    return this.value ? [this.value] : [];
  }

  rewrite(values: Map<Identifier, Place>): ReturnOp {
    if (!this.value) return this;
    const value = values.get(this.value.identifier) ?? this.value;
    if (value === this.value) return this;
    return new ReturnOp(this.id, value);
  }

  clone(ctx: CloneContext): ReturnOp {
    const value =
      this.value === null ? null : (ctx.identifierMap.get(this.value.identifier) ?? this.value);
    return new ReturnOp(nextId(ctx), value);
  }

  override remap(): void {}

  override getBlockRefs(): BlockId[] {
    return [];
  }

  public override print(): string {
    return `return${this.value ? " " + this.value.print() : ""}`;
  }
}
