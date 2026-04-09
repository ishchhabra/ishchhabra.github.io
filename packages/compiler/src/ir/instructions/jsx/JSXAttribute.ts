import type { ModuleIR } from "../../core/ModuleIR";
import { BaseInstruction, InstructionId, JSXInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents a JSX attribute in the IR.
 *
 * Examples:
 * - `className={x}` (name="className", value=place for x)
 * - `disabled` (name="disabled", value=undefined)
 * - `foo="bar"` (name="foo", value=place for "bar")
 */
export class JSXAttributeInstruction extends JSXInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly name: string,
    public readonly value: Place | undefined,
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): JSXAttributeInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      JSXAttributeInstruction,
      place,
      this.name,
      this.value,
    );
  }

  public rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new JSXAttributeInstruction(
      this.id,
      this.place,
      this.name,
      this.value ? (values.get(this.value.identifier) ?? this.value) : undefined,
    );
  }

  public getOperands(): Place[] {
    return this.value ? [this.value] : [];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
