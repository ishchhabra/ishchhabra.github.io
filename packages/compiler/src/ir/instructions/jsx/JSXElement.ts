import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, JSXInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents a JSX element in the IR.
 *
 * Examples:
 * - `<div />`
 * - `<div>Hello, world!</div>`
 */
export class JSXElementInstruction extends JSXInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly openingElement: Place,
    public readonly closingElement: Place | undefined,
    public readonly children: Place[],
  ) {
    super(id, place);
  }

  public clone(environment: Environment): JSXElementInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      JSXElementInstruction,
      place,
      this.openingElement,
      this.closingElement,
      this.children,
    );
  }

  public rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new JSXElementInstruction(
      this.id,
      this.place,
      values.get(this.openingElement.identifier) ?? this.openingElement,
      this.closingElement
        ? (values.get(this.closingElement.identifier) ?? this.closingElement)
        : undefined,
      this.children.map((child) => values.get(child.identifier) ?? child),
    );
  }

  public getOperands(): Place[] {
    return [
      this.openingElement,
      ...(this.closingElement ? [this.closingElement] : []),
      ...this.children,
    ];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
