import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, JSXInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents a JSX closing element in the IR.
 *
 * Examples:
 * - `</div>`
 * - `</MyComponent>`
 */
export class JSXClosingElementInstruction extends JSXInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly nodePath: NodePath<t.Node> | undefined,
    public readonly tagPlace: Place,
  ) {
    super(id, place, nodePath);
  }

  public clone(environment: Environment): JSXClosingElementInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      JSXClosingElementInstruction,
      place,
      this.nodePath,
      this.tagPlace,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new JSXClosingElementInstruction(
      this.id,
      this.place,
      this.nodePath,
      values.get(this.tagPlace.identifier) ?? this.tagPlace,
    );
  }

  getReadPlaces(): Place[] {
    return [this.tagPlace];
  }

  public override get hasSideEffects(): boolean {
    return false;
  }
}
