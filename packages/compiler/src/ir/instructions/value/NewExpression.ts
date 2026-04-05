import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";

export class NewExpressionInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly callee: Place,
    public readonly args: Place[],
  ) {
    super(id, place);
  }

  public clone(environment: Environment): NewExpressionInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(NewExpressionInstruction, place, this.callee, this.args);
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new NewExpressionInstruction(
      this.id,
      this.place,
      values.get(this.callee.identifier) ?? this.callee,
      this.args.map((arg) => values.get(arg.identifier) ?? arg),
    );
  }

  getOperands(): Place[] {
    return [this.callee, ...this.args];
  }
}
