import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * An instruction that loads a **dynamic** property for an object:
 * `object[property]`.
 */
export class LoadDynamicPropertyOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly object: Place,
    public readonly property: Place,
    public readonly optional: boolean = false,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): LoadDynamicPropertyOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      LoadDynamicPropertyOp,
      place,
      this.object,
      this.property,
      this.optional,
    );
  }

  rewrite(values: Map<Identifier, Place>): LoadDynamicPropertyOp {
    return new LoadDynamicPropertyOp(
      this.id,
      this.place,
      values.get(this.object.identifier) ?? this.object,
      values.get(this.property.identifier) ?? this.property,
      this.optional,
    );
  }

  getOperands(): Place[] {
    return [this.object, this.property];
  }

  public override print(): string {
    return `${this.place.print()} = ${this.object.print()}[${this.property.print()}]`;
  }
}
