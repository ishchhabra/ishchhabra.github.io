import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, JSXInstruction } from "../../base";
import { Place } from "../../core";

/**
 * Represents a JSX closing fragment in the IR.
 *
 * Examples:
 * - `</>`
 */
export class JSXClosingFragmentInstruction extends JSXInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly nodePath: NodePath<t.JSXClosingFragment> | undefined,
  ) {
    super(id, place, nodePath);
  }

  public clone(environment: Environment): JSXClosingFragmentInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(JSXClosingFragmentInstruction, place, this.nodePath);
  }

  rewrite(): BaseInstruction {
    return this;
  }

  getReadPlaces(): Place[] {
    return [];
  }
}
