import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import { type OperationEffects, UnknownOperationEffects } from "../../effects";
import type { PropertyKey } from "./PropertyKey";

/**
 * Reads a property through ECMAScript `super` lookup.
 *
 * `super` is not an SSA value. The base object, receiver, and home object come
 * from the enclosing method context, while computed property keys remain normal
 * operands so evaluation order is explicit.
 *
 * @example
 * ```js
 * super.name;
 * super[key];
 * ```
 */
export class SuperPropertyOp extends Operation {
  constructor(
    id: OperationId,
    public readonly key: PropertyKey,
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return this.key.kind === "computed" ? [this.key.value] : [];
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): SuperPropertyOp {
    const expected = this.key.kind === "computed" ? 1 : 0;
    if (operands.length !== expected) {
      throw new Error(
        `SuperPropertyOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    if (this.key.kind === "static") return this;

    const key = { kind: "computed" as const, value: operands[0] };
    return key.value === this.key.value ? this : new SuperPropertyOp(this.id, key, this.result);
  }

  public override clone(context: OperationCloneContext): SuperPropertyOp {
    return new SuperPropertyOp(
      context.ids.operationId(),
      this.key.kind === "computed"
        ? { kind: "computed", value: context.value(this.key.value) }
        : this.key,
      context.result(this.result),
    );
  }
}
