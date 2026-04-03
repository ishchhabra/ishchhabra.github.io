import { Environment } from "../../../environment";
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

  public clone(environment: Environment): JSXAttributeInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
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

  public getReadPlaces(): Place[] {
    return this.value ? [this.value] : [];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
