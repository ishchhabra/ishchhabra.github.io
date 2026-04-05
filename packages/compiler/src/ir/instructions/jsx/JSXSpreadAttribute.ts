import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, JSXInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents a JSX spread attribute in the IR.
 *
 * Examples:
 * - `{...props}` (argument=place for props)
 * - `{...getProps()}` (argument=place for getProps())
 */
export class JSXSpreadAttributeInstruction extends JSXInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly argument: Place,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): JSXSpreadAttributeInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(JSXSpreadAttributeInstruction, place, this.argument);
  }

  public rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new JSXSpreadAttributeInstruction(
      this.id,
      this.place,
      values.get(this.argument.identifier) ?? this.argument,
    );
  }

  public getOperands(): Place[] {
    return [this.argument];
  }
}
