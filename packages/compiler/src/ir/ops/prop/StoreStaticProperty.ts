import { OperationId } from "../../core";
import { Value } from "../../core";
import type { CloneContext } from "../../core/Operation";
import { effects, staticPropertyLocation, type MemoryEffects } from "../../memory/MemoryLocation";
import { StorePropertyOp } from "./StoreProperty";

/**
 * An instruction that stores a value into a **static** property of an
 * object: `object.foo = v`, `object["literal"] = v`, or
 * `object[0] = v` (numeric-literal keys are folded to strings at HIR
 * time).
 */
export class StoreStaticPropertyOp extends StorePropertyOp {
  constructor(
    id: OperationId,
    place: Value,
    object: Value,
    public readonly property: string,
    value: Value,
  ) {
    super(id, place, object, value);
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

  public override getMemoryEffects(_env?: unknown): MemoryEffects {
    return effects([], [staticPropertyLocation(this.object, this.property)]);
  }

  public override print(): string {
    return `${this.place.print()} = store_static_property ${this.object.print()}, "${this.property}", ${this.value.print()}`;
  }
}
