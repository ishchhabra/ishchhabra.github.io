import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, PatternInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents an array pattern in the IR.
 *
 * Examples:
 * - `const [x, y] = [1, 2] // [x, y] is the array pattern`
 */
export class ArrayPatternInstruction extends PatternInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly nodePath: NodePath<t.ArrayPattern> | undefined,
    public readonly elements: Place[],
    public readonly bindings: Place[] = [],
  ) {
    super(id, place, nodePath);
  }

  public clone(environment: Environment): ArrayPatternInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      ArrayPatternInstruction,
      place,
      this.nodePath,
      this.elements,
      this.bindings,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new ArrayPatternInstruction(
      this.id,
      this.place,
      this.nodePath,
      this.elements.map((element) => values.get(element.identifier) ?? element),
      this.bindings.map((binding) => values.get(binding.identifier) ?? binding),
    );
  }

  getReadPlaces(): Place[] {
    return [];
  }

  override getWrittenPlaces(): Place[] {
    return [this.place, ...this.bindings];
  }

  public override get hasSideEffects(): boolean {
    return false;
  }
}
