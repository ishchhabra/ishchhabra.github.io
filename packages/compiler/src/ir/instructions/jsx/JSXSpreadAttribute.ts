import { NodePath } from "@babel/core";
import * as t from "@babel/types";
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
    public readonly nodePath: NodePath<t.Node> | undefined,
    public readonly argument: Place,
  ) {
    super(id, place, nodePath);
  }

  public clone(environment: Environment): JSXSpreadAttributeInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      JSXSpreadAttributeInstruction,
      place,
      this.nodePath,
      this.argument,
    );
  }

  public rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new JSXSpreadAttributeInstruction(
      this.id,
      this.place,
      this.nodePath,
      values.get(this.argument.identifier) ?? this.argument,
    );
  }

  public getReadPlaces(): Place[] {
    return [this.argument];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
