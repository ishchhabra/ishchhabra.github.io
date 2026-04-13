import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class ClassExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly identifier: Place | null = null,
    public readonly superClass: Place | null = null,
    public readonly elements: Place[] = [],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ClassExpressionOp {
    const moduleIR = ctx.moduleIR;
    const newIdentifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(newIdentifier);
    return moduleIR.environment.createOperation(
      ClassExpressionOp,
      place,
      this.identifier,
      this.superClass,
      this.elements,
    );
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    const newIdentifier = this.identifier ? this.identifier.rewrite(values) : null;
    const newSuperClass = this.superClass ? this.superClass.rewrite(values) : null;
    const newElements = this.elements.map((element) => element.rewrite(values));

    const identifierChanged = newIdentifier !== this.identifier;
    const superChanged = newSuperClass !== this.superClass;
    const elementsChanged = newElements.some((e, i) => e !== this.elements[i]);
    if (!identifierChanged && !superChanged && !elementsChanged) {
      return this;
    }
    return new ClassExpressionOp(this.id, this.place, newIdentifier, newSuperClass, newElements);
  }

  getOperands(): Place[] {
    const operands: Place[] = [];
    if (this.superClass !== null) operands.push(this.superClass);
    operands.push(...this.elements);
    return operands;
  }
}
