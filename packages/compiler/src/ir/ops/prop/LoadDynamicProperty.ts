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
 * An instruction that loads a **dynamic** property for an object:
 * `object[property]`.
 */
export class LoadDynamicPropertyOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly object: Value,
    public readonly property: Value,
    public readonly optional: boolean = false,
  ) {
    super(id);
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

  getOperands(): Value[] {
    return [this.object, this.property];
  }

  public override getMemoryEffects(_env?: unknown): MemoryEffects {
    return effects([computedPropertyLocation(this.object)], []);
  }

  public override print(): string {
    return `${this.place.print()} = ${this.object.print()}[${this.property.print()}]`;
  }
}
