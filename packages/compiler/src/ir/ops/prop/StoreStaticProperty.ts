import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * An instruction that stores a value into a **static** property for an object:
 * `object[0]` or `object.foo`.
 */
export class StoreStaticPropertyOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly object: Value,
    public readonly property: string,
    public readonly value: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): StoreStaticPropertyOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(
      StoreStaticPropertyOp,
      place,
      this.object,
      this.property,
      this.value,
    );
  }

  rewrite(values: Map<Value, Value>): StoreStaticPropertyOp {
    return new StoreStaticPropertyOp(
      this.id,
      this.place,
      values.get(this.object) ?? this.object,
      this.property,
      values.get(this.value) ?? this.value,
    );
  }

  getOperands(): Value[] {
    return [this.object, this.value];
  }
}
