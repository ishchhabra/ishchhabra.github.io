import { Environment } from "../../../environment";
import { BaseInstruction, DeclarationInstruction } from "../../base";
import { FunctionIR } from "../../core/FunctionIR";
import { Identifier, Place } from "../../core";

export class FunctionDeclarationInstruction extends DeclarationInstruction {
  constructor(
    public readonly id: import("../../base").InstructionId,
    public readonly place: Place,
    public readonly functionIR: FunctionIR,
    public readonly generator: boolean,
    public readonly async: boolean,
    public readonly captures: Place[] = [],
    public emit = true,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): FunctionDeclarationInstruction {
    const identifier = environment.createIdentifier(this.place.identifier.declarationId);
    identifier.name = this.place.identifier.name;
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      FunctionDeclarationInstruction,
      place,
      this.functionIR,
      this.generator,
      this.async,
      this.captures,
      this.emit,
    );
  }

  public rewrite(values: Map<Identifier, Place>): BaseInstruction {
    const newCaptures = this.captures.map((capture) => capture.rewrite(values));
    const capturesChanged = newCaptures.some((capture, index) => capture !== this.captures[index]);
    if (!capturesChanged) {
      return this;
    }

    return new FunctionDeclarationInstruction(
      this.id,
      this.place,
      this.functionIR,
      this.generator,
      this.async,
      newCaptures,
      this.emit,
    );
  }

  public getOperands(): Place[] {
    return this.captures;
  }

  public override getDefs(): Place[] {
    return [this.place];
  }
}
