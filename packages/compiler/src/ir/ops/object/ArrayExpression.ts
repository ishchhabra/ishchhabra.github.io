import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents an array expression.
 *
 * Example:
 * [1, 2, 3]
 */
export class ArrayExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly elements: Place[],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ArrayExpressionOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(ArrayExpressionOp, place, this.elements);
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    return new ArrayExpressionOp(
      this.id,
      this.place,
      this.elements.map((element) => values.get(element.identifier) ?? element),
    );
  }

  getOperands(): Place[] {
    return this.elements;
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `${this.place.print()} = [${this.elements.map((e) => (e ? e.print() : "<hole>")).join(", ")}]`;
  }
}
