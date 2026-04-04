import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents a binary expression.
 *
 * Example:
 * 1 + 2
 */
export class BinaryExpressionInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly operator: t.BinaryExpression["operator"],
    public readonly left: Place,
    public readonly right: Place,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): BinaryExpressionInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      BinaryExpressionInstruction,
      place,
      this.operator,
      this.left,
      this.right,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new BinaryExpressionInstruction(
      this.id,
      this.place,
      this.operator,
      values.get(this.left.identifier) ?? this.left,
      values.get(this.right.identifier) ?? this.right,
    );
  }

  getOperands(): Place[] {
    return [this.left, this.right];
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `${this.place.print()} = ${this.left.print()} ${this.operator} ${this.right.print()}`;
  }
}
