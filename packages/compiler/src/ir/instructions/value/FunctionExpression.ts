import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { FunctionIR } from "../../core/FunctionIR";
import { Identifier } from "../../core/Identifier";
import { Place } from "../../core/Place";

export class FunctionExpressionInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly identifier: Place | null,
    public readonly functionIR: FunctionIR,
    public readonly generator: boolean,
    public readonly async: boolean,
    public readonly captures: Place[] = [],
  ) {
    super(id, place);
  }

  public clone(environment: Environment): FunctionExpressionInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      FunctionExpressionInstruction,
      place,
      this.identifier,
      this.functionIR.clone(environment),
      this.generator,
      this.async,
      this.captures,
    );
  }

  public rewrite(values: Map<Identifier, Place>): BaseInstruction {
    const newIdentifier = this.identifier ? this.identifier.rewrite(values) : null;
    const newCaptures = this.captures.map((c) => c.rewrite(values));

    const capturesChanged = newCaptures.some((c, i) => c !== this.captures[i]);
    const identifierChanged = newIdentifier !== this.identifier;
    if (!capturesChanged && !identifierChanged) {
      return this;
    }

    return new FunctionExpressionInstruction(
      this.id,
      this.place,
      newIdentifier,
      this.functionIR,
      this.generator,
      this.async,
      newCaptures,
    );
  }

  public getOperands(): Place[] {
    if (this.identifier !== null) {
      return [this.identifier, ...this.captures];
    }
    return this.captures;
  }

  public override getDefs(): Place[] {
    return [this.place];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
