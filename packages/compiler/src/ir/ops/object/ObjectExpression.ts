import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents an object expression.
 *
 * Example:
 * { a: 1, b: 2 }
 */
export class ObjectExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly properties: Place[],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ObjectExpressionOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(ObjectExpressionOp, place, this.properties);
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    return new ObjectExpressionOp(
      this.id,
      this.place,
      this.properties.map((property) => values.get(property.identifier) ?? property),
    );
  }

  getOperands(): Place[] {
    return this.properties;
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `${this.place.print()} = {${this.properties.map((p) => p.print()).join(", ")}}`;
  }
}
