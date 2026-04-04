import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, JSXInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents a JSX member expression (compound tag name) in the IR.
 *
 * Examples:
 * - `Foo.Bar` in `<Foo.Bar>`
 * - `Foo.Bar.Baz` is represented as nested: JSXMemberExpression(JSXMemberExpression(Foo, Bar), Baz)
 */
export class JSXMemberExpressionInstruction extends JSXInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly object: Place,
    public readonly property: string,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): JSXMemberExpressionInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      JSXMemberExpressionInstruction,
      place,
      this.object,
      this.property,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new JSXMemberExpressionInstruction(
      this.id,
      this.place,
      values.get(this.object.identifier) ?? this.object,
      this.property,
    );
  }

  getOperands(): Place[] {
    return [this.object];
  }
}
