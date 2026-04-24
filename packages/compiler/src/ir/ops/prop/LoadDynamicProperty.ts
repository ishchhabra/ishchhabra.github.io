import { OperationId } from "../../core";
import { Value } from "../../core";
import type { CloneContext } from "../../core/Operation";
import { computedPropertyLocation, effects, type MemoryEffects } from "../../memory/MemoryLocation";
import { LoadPropertyOp } from "./LoadProperty";

/**
 * An instruction that loads a **dynamic** property of an object:
 * `object[property]` where `property` is a computed expression.
 */
export class LoadDynamicPropertyOp extends LoadPropertyOp {
  constructor(
    id: OperationId,
    place: Value,
    object: Value,
    public readonly property: Value,
    optional: boolean = false,
  ) {
    super(id, place, object, optional);
  }

  public clone(ctx: CloneContext): LoadDynamicPropertyOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(
      LoadDynamicPropertyOp,
      place,
      this.object,
      this.property,
      this.optional,
    );
  }

  rewrite(values: Map<Value, Value>): LoadDynamicPropertyOp {
    return new LoadDynamicPropertyOp(
      this.id,
      this.place,
      values.get(this.object) ?? this.object,
      values.get(this.property) ?? this.property,
      this.optional,
    );
  }

  operands(): Value[] {
    return [this.object, this.property];
  }

  public override getMemoryEffects(_env?: unknown): MemoryEffects {
    return effects([computedPropertyLocation(this.object)], []);
  }

  public override print(): string {
    const attrs = this.optional ? ` {optional}` : "";
    return `${this.place.print()} = load_dynamic_property ${this.object.print()}, ${this.property.print()}${attrs}`;
  }
}
