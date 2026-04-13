import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * An instruction that loads a **static** property for an object:
 * `object[0]` or `object.foo`.
 */
export class LoadStaticPropertyOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly object: Place,
    public readonly property: string,
    public readonly optional: boolean = false,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): LoadStaticPropertyOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      LoadStaticPropertyOp,
      place,
      this.object,
      this.property,
      this.optional,
    );
  }

  rewrite(values: Map<Identifier, Place>): LoadStaticPropertyOp {
    return new LoadStaticPropertyOp(
      this.id,
      this.place,
      values.get(this.object.identifier) ?? this.object,
      this.property,
      this.optional,
    );
  }

  getOperands(): Place[] {
    return [this.object];
  }

  public override print(): string {
    return `${this.place.print()} = ${this.object.print()}.${this.property}`;
  }
}
