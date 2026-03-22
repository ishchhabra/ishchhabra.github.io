import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents a dynamic import expression.
 *
 * Example:
 * import("./module")
 */
export class ImportExpressionInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly nodePath: NodePath<t.CallExpression> | undefined,
    public readonly source: Place,
  ) {
    super(id, place, nodePath);
  }

  public clone(environment: Environment): ImportExpressionInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      ImportExpressionInstruction,
      place,
      this.nodePath,
      this.source,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new ImportExpressionInstruction(
      this.id,
      this.place,
      this.nodePath,
      values.get(this.source.identifier) ?? this.source,
    );
  }

  getReadPlaces(): Place[] {
    return [this.source];
  }
}
