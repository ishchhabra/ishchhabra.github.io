import { Environment } from "../../../environment";
import { InstructionId, JSXInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents a JSX fragment in the IR.
 *
 * Examples:
 * - `<></>`
 * - `<>{foo}</>`
 */
export class JSXFragmentInstruction extends JSXInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly openingFragment: Place,
    public readonly closingFragment: Place,
    public readonly children: Place[],
  ) {
    super(id, place);
  }

  public clone(environment: Environment): JSXFragmentInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      JSXFragmentInstruction,
      place,
      this.openingFragment,
      this.closingFragment,
      this.children,
    );
  }

  rewrite(values: Map<Identifier, Place>): JSXFragmentInstruction {
    return new JSXFragmentInstruction(
      this.id,
      this.place,
      this.openingFragment,
      this.closingFragment,
      this.children.map((child) => values.get(child.identifier) ?? child),
    );
  }

  getOperands(): Place[] {
    return [this.openingFragment, this.closingFragment, ...this.children];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
