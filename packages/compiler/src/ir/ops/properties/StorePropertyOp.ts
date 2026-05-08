import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import {
  namedPropertyMemoryLocation,
  unknownPropertyMemoryLocation,
  type OperationEffects,
} from "../../effects";
import type { PropertyKey } from "./PropertyKey";

/**
 * Writes a property on an object value.
 *
 * The operation can optionally produce the assignment completion value when the
 * surrounding expression needs to consume it.
 */
export class StorePropertyOp extends Operation {
  constructor(
    id: OperationId,
    public readonly object: Value,
    public readonly key: PropertyKey,
    public readonly value: Value,
    result?: Value,
  ) {
    super(id, result === undefined ? [] : [result]);
  }

  public override operands(): readonly Value[] {
    return this.key.kind === "computed"
      ? [this.object, this.key.value, this.value]
      : [this.object, this.value];
  }

  public override effects(): OperationEffects {
    return {
      memory: {
        reads: [],
        writes: [
          this.key.kind === "static"
            ? namedPropertyMemoryLocation(this.object.id, this.key.name)
            : unknownPropertyMemoryLocation(this.object.id),
        ],
      },
      mayThrow: true,
      mayDiverge: false,
      isObservable: true,
    };
  }

  public override withOperands(operands: readonly Value[]): StorePropertyOp {
    const expected = this.key.kind === "computed" ? 3 : 2;
    if (operands.length !== expected) {
      throw new Error(
        `StorePropertyOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const [object, maybeKeyOrValue, maybeValue] = operands;
    const key =
      this.key.kind === "computed"
        ? { kind: "computed" as const, value: maybeKeyOrValue }
        : this.key;
    const value = this.key.kind === "computed" ? maybeValue : maybeKeyOrValue;

    if (
      object === this.object &&
      value === this.value &&
      (this.key.kind === "static" || maybeKeyOrValue === this.key.value)
    ) {
      return this;
    }

    return new StorePropertyOp(this.id, object, key, value, this.results[0]);
  }

  public override clone(context: OperationCloneContext): StorePropertyOp {
    return new StorePropertyOp(
      context.ids.operationId(),
      context.value(this.object),
      this.key.kind === "computed"
        ? { kind: "computed", value: context.value(this.key.value) }
        : this.key,
      context.value(this.value),
      this.results[0] === undefined ? undefined : context.result(this.results[0]),
    );
  }
}
