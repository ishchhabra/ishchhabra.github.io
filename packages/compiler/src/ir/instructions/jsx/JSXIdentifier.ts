import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, JSXInstruction } from "../../base";
import { Place } from "../../core";

/**
 * Represents a JSX identifier (tag name) in the IR.
 *
 * Examples:
 * - `div` in `<div>`
 * - `MyComponent` in `<MyComponent>`
 */
export class JSXIdentifierInstruction extends JSXInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly nodePath: NodePath<t.Node> | undefined,
    public readonly name: string,
  ) {
    super(id, place, nodePath);
  }

  public clone(environment: Environment): JSXIdentifierInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(JSXIdentifierInstruction, place, this.nodePath, this.name);
  }

  rewrite(): BaseInstruction {
    return this;
  }

  getReadPlaces(): Place[] {
    return [];
  }

  public override get hasSideEffects(): boolean {
    return false;
  }
}
