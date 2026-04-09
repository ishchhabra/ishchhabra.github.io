import type { ModuleIR } from "../../core/ModuleIR";
import { BaseInstruction, InstructionId, JSXInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents a JSX opening element in the IR.
 *
 * Examples:
 * - `<div className={x}>`
 * - `<MyComponent foo="bar" />`
 */
export class JSXOpeningElementInstruction extends JSXInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly tagPlace: Place,
    public readonly attributes: Place[],
    public readonly selfClosing: boolean,
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): JSXOpeningElementInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      JSXOpeningElementInstruction,
      place,
      this.tagPlace,
      this.attributes,
      this.selfClosing,
    );
  }

  public rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new JSXOpeningElementInstruction(
      this.id,
      this.place,
      values.get(this.tagPlace.identifier) ?? this.tagPlace,
      this.attributes.map((attr) => values.get(attr.identifier) ?? attr),
      this.selfClosing,
    );
  }

  public getOperands(): Place[] {
    return [this.tagPlace, ...this.attributes];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
