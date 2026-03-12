import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents a conditional (ternary) expression: `test ? consequent : alternate`.
 */
export class ConditionalExpressionInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly nodePath: NodePath<t.Node> | undefined,
    public readonly test: Place,
    public readonly consequent: Place,
    public readonly alternate: Place,
  ) {
    super(id, place, nodePath);
  }

  public clone(environment: Environment): ConditionalExpressionInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      ConditionalExpressionInstruction,
      place,
      this.nodePath,
      this.test,
      this.consequent,
      this.alternate,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new ConditionalExpressionInstruction(
      this.id,
      this.place,
      this.nodePath,
      values.get(this.test.identifier) ?? this.test,
      values.get(this.consequent.identifier) ?? this.consequent,
      values.get(this.alternate.identifier) ?? this.alternate,
    );
  }

  getReadPlaces(): Place[] {
    return [this.test, this.consequent, this.alternate];
  }

  public get isPure(): boolean {
    return true;
  }
}
