import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
import {
  computedPropertyLocation,
  effects,
  type MemoryEffects,
} from "../../memory/MemoryLocation";
/**
 * An instruction that stores a value into a **dynamic** property for an object:
 * `object[property]`.
 */
export class StoreDynamicPropertyOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly object: Value,
    public readonly property: Value,
    public readonly value: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): StoreDynamicPropertyOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(
      StoreDynamicPropertyOp,
      place,
      this.object,
      this.property,
      this.value,
    );
  }

  rewrite(values: Map<Value, Value>): StoreDynamicPropertyOp {
    return new StoreDynamicPropertyOp(
      this.id,
      this.place,
      values.get(this.object) ?? this.object,
      values.get(this.property) ?? this.property,
      values.get(this.value) ?? this.value,
    );
  }

  getOperands(): Value[] {
    return [this.object, this.property, this.value];
  }

  public override getMemoryEffects(_env?: unknown): MemoryEffects {
    return effects([], [computedPropertyLocation(this.object)]);
  }
}
