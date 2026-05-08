import { Operation, OperationId } from "../../core/Operation";
import { OperationCloneContext } from "../../core/OperationCloneContext";
import { Value } from "../../core/Value";
import {
  namedPropertyMemoryLocation,
  OperationEffects,
  unknownPropertyMemoryLocation,
} from "../../effects";
import { PropertyKey } from "./PropertyKey";

/**
 * Reads a property from an object value.
 *
 * Static keys represent property names known during lowering. Computed keys
 * preserve the evaluated key value, so evaluation order remains explicit in the
 * operand list.
 */
export class LoadPropertyOp extends Operation {
  constructor(
    id: OperationId,
    public readonly object: Value,
    public readonly key: PropertyKey,
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return this.key.kind === "computed" ? [this.object, this.key.value] : [this.object];
  }

  public override effects(): OperationEffects {
    return {
      memory: {
        reads: [
          this.key.kind === "static"
            ? namedPropertyMemoryLocation(this.object.id, this.key.name)
            : unknownPropertyMemoryLocation(this.object.id),
        ],
        writes: [],
      },
      mayThrow: true,
      mayDiverge: false,
      isObservable: false,
    };
  }

  public override withOperands(operands: readonly Value[]): LoadPropertyOp {
    const expected = this.key.kind === "computed" ? 2 : 1;
    if (operands.length !== expected) {
      throw new Error(
        `LoadPropertyOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const [object, computedKey] = operands;
    const key =
      this.key.kind === "computed" ? { kind: "computed" as const, value: computedKey } : this.key;

    if (object === this.object && (this.key.kind === "static" || computedKey === this.key.value)) {
      return this;
    }

    return new LoadPropertyOp(this.id, object, key, this.result);
  }

  public override clone(context: OperationCloneContext): LoadPropertyOp {
    return new LoadPropertyOp(
      context.ids.operationId(),
      context.value(this.object),
      this.key.kind === "computed"
        ? { kind: "computed", value: context.value(this.key.value) }
        : this.key,
      context.result(this.result),
    );
  }
}
