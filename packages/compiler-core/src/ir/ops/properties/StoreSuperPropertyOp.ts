import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import { type OperationEffects, UnknownOperationEffects } from "../../effects";
import type { PropertyKey } from "./PropertyKey";

/**
 * Writes a property through ECMAScript `super` assignment semantics.
 *
 * `super` is not an SSA value. The base object, receiver, and home object come
 * from the enclosing method context. The assigned value is explicit, and
 * computed keys remain operands so evaluation order is preserved.
 *
 * @example
 * ```js
 * super.name = value;
 * super[key] = value;
 * ```
 */
export class StoreSuperPropertyOp extends Operation {
  constructor(
    id: OperationId,
    public readonly key: PropertyKey,
    public readonly value: Value,
    result?: Value,
  ) {
    super(id, result === undefined ? [] : [result]);
  }

  public override operands(): readonly Value[] {
    return this.key.kind === "computed" ? [this.key.value, this.value] : [this.value];
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): StoreSuperPropertyOp {
    const expected = this.key.kind === "computed" ? 2 : 1;
    if (operands.length !== expected) {
      throw new Error(
        `StoreSuperPropertyOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const key =
      this.key.kind === "computed" ? { kind: "computed" as const, value: operands[0] } : this.key;
    const value = this.key.kind === "computed" ? operands[1] : operands[0];

    if (value === this.value && (this.key.kind === "static" || operands[0] === this.key.value)) {
      return this;
    }

    return new StoreSuperPropertyOp(this.id, key, value, this.results[0]);
  }

  public override clone(context: OperationCloneContext): StoreSuperPropertyOp {
    return new StoreSuperPropertyOp(
      context.ids.operationId(),
      this.key.kind === "computed"
        ? { kind: "computed", value: context.value(this.key.value) }
        : this.key,
      context.value(this.value),
      this.results[0] === undefined ? undefined : context.result(this.results[0]),
    );
  }
}
