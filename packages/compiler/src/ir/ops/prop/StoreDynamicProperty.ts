import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * An instruction that stores a value into a **dynamic** property for an object:
 * `object[property]`.
 */
export class StoreDynamicPropertyOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly object: Place,
    public readonly property: Place,
    public readonly value: Place,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): StoreDynamicPropertyOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      StoreDynamicPropertyOp,
      place,
      this.object,
      this.property,
      this.value,
    );
  }

  rewrite(values: Map<Identifier, Place>): StoreDynamicPropertyOp {
    return new StoreDynamicPropertyOp(
      this.id,
      this.place,
      values.get(this.object.identifier) ?? this.object,
      values.get(this.property.identifier) ?? this.property,
      values.get(this.value.identifier) ?? this.value,
    );
  }

  getOperands(): Place[] {
    return [this.object, this.property, this.value];
  }
}
