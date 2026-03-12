import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";

export class ClassExpressionInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly nodePath: NodePath<t.ClassExpression> | undefined,
  ) {
    super(id, place, nodePath);
  }

  public clone(environment: Environment): ClassExpressionInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(ClassExpressionInstruction, place, this.nodePath);
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    for (const [identifier, place] of values) {
      const oldName = `$${identifier.declarationId}_0`;
      const newName = place.identifier.name;
      this.nodePath?.scope.rename(oldName, newName);
    }
    return this;
  }

  getReadPlaces(): Place[] {
    return [];
  }

  public get isPure(): boolean {
    return false;
  }
}
