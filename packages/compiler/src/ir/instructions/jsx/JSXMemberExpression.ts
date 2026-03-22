import { NodePath } from "@babel/core";
import * as t from "@babel/types";
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
    public readonly nodePath: NodePath<t.Node> | undefined,
    public readonly object: Place,
    public readonly property: string,
  ) {
    super(id, place, nodePath);
  }

  public clone(environment: Environment): JSXMemberExpressionInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      JSXMemberExpressionInstruction,
      place,
      this.nodePath,
      this.object,
      this.property,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new JSXMemberExpressionInstruction(
      this.id,
      this.place,
      this.nodePath,
      values.get(this.object.identifier) ?? this.object,
      this.property,
    );
  }

  getReadPlaces(): Place[] {
    return [this.object];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
