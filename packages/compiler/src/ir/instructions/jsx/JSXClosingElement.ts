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
    public readonly tagPlace: Place,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): JSXClosingElementInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      JSXClosingElementInstruction,
      place,
      this.tagPlace,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new JSXClosingElementInstruction(
      this.id,
      this.place,
      values.get(this.tagPlace.identifier) ?? this.tagPlace,
    );
  }

  getReadPlaces(): Place[] {
    return [this.tagPlace];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
