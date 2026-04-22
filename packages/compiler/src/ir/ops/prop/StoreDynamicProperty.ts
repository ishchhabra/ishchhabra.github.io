import { OperationId } from "../../core";
import { Value } from "../../core";
import type { CloneContext } from "../../core/Operation";
import { computedPropertyLocation, effects, type MemoryEffects } from "../../memory/MemoryLocation";
import { StorePropertyOp } from "./StoreProperty";

/**
 * An instruction that stores a value into a **dynamic** property of
 * an object: `object[property] = v` where `property` is a computed
 * expression.
 */
export class StoreDynamicPropertyOp extends StorePropertyOp {
  constructor(
    id: OperationId,
    place: Value,
    object: Value,
    public readonly property: Value,
    value: Value,
  ) {
    super(id, place, object, value);
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

  public override print(): string {
    return `${this.place.print()} = store_dynamic_property ${this.object.print()}, ${this.property.print()}, ${this.value.print()}`;
  }
}
