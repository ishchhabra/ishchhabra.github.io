import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";

export class ClassExpressionInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly identifier: Place | null = null,
    public readonly superClass: Place | null = null,
    public readonly elements: Place[] = [],
  ) {
    super(id, place);
  }

  public clone(environment: Environment): ClassExpressionInstruction {
    const newIdentifier = environment.createIdentifier();
    const place = environment.createPlace(newIdentifier);
    return environment.createInstruction(
      ClassExpressionInstruction,
      place,
      this.identifier,
      this.superClass,
      this.elements,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    const newIdentifier = this.identifier ? this.identifier.rewrite(values) : null;
    const newSuperClass = this.superClass ? this.superClass.rewrite(values) : null;
    const newElements = this.elements.map((element) => element.rewrite(values));

    const identifierChanged = newIdentifier !== this.identifier;
    const superChanged = newSuperClass !== this.superClass;
    const elementsChanged = newElements.some((e, i) => e !== this.elements[i]);
    if (!identifierChanged && !superChanged && !elementsChanged) {
      return this;
    }
    return new ClassExpressionInstruction(
      this.id,
      this.place,
      newIdentifier,
      newSuperClass,
      newElements,
    );
  }

  getOperands(): Place[] {
    const operands: Place[] = [];
    if (this.superClass !== null) operands.push(this.superClass);
    operands.push(...this.elements);
    return operands;
  }
}
