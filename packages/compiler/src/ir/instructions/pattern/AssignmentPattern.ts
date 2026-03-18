import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, PatternInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents an assignment pattern with a default value.
 *
 * Examples:
 * - `function foo(a = 1)` - Parameter default value
 * - `const {x = 1} = obj` - Destructuring with default value
 */
export class AssignmentPatternInstruction extends PatternInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly nodePath: NodePath<t.Node> | undefined,
    public readonly left: Place,
    public readonly right: Place,
    public readonly bindings: Place[] = [],
  ) {
    super(id, place, nodePath);
  }

  public clone(environment: Environment): AssignmentPatternInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      AssignmentPatternInstruction,
      place,
      this.nodePath,
      this.left,
      this.right,
      this.bindings,
    );
  }

  public rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new AssignmentPatternInstruction(
      this.id,
      this.place,
      this.nodePath,
      values.get(this.left.identifier) ?? this.left,
      values.get(this.right.identifier) ?? this.right,
      this.bindings.map((binding) => values.get(binding.identifier) ?? binding),
    );
  }

  public getReadPlaces(): Place[] {
    return [this.right];
  }

  public override getWrittenPlaces(): Place[] {
    return [this.place, ...this.bindings];
  }

  public override get hasSideEffects(): boolean {
    return false;
  }
}
