import { Environment } from "../../environment";
import { BaseInstruction, InstructionId } from "../base";
import { Identifier, Place } from "../core";

/**
 * Represents a rest element in the IR.
 *
 * Examples:
 * - const [a, ...b] = [1, 2, 3, 4, 5];
 */
export class RestElementInstruction extends BaseInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly argument: Place,
    public readonly bindings: Place[] = [],
  ) {
    super(id, place);
  }

  public clone(environment: Environment): RestElementInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      RestElementInstruction,
      place,
      this.argument,
      this.bindings,
    );
  }

  public rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new RestElementInstruction(
      this.id,
      this.place,
      values.get(this.argument.identifier) ?? this.argument,
      this.bindings.map((binding) => values.get(binding.identifier) ?? binding),
    );
  }

  public getReadPlaces(): Place[] {
    return [];
  }

  public override getWrittenPlaces(): Place[] {
    return [this.place, ...this.bindings];
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `${this.place.print()} = ...${this.argument.print()}`;
  }
}
