import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { FunctionIR } from "../../core/FunctionIR";
import { Identifier } from "../../core/Identifier";
import { Place } from "../../core/Place";

export class FunctionExpressionInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly nodePath: NodePath<t.FunctionExpression | t.FunctionDeclaration> | undefined,
    public readonly identifier: Place | null,
    public readonly functionIR: FunctionIR,
    public readonly generator: boolean,
    public readonly async: boolean,
    public readonly captures: Place[] = [],
  ) {
    super(id, place, nodePath);
  }

  public clone(environment: Environment): FunctionExpressionInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      FunctionExpressionInstruction,
      place,
      this.nodePath,
      this.identifier,
      this.functionIR,
      this.generator,
      this.async,
      this.captures,
    );
  }

  public rewrite(values: Map<Identifier, Place>): BaseInstruction {
    const newIdentifier = this.identifier ? this.identifier.rewrite(values) : null;
    const newCaptures = this.captures.map((c) => c.rewrite(values));

    const capturesChanged = newCaptures.some((c, i) => c !== this.captures[i]);
    const identifierChanged = newIdentifier !== this.identifier;
    if (!capturesChanged && !identifierChanged) {
      return this;
    }

    return new FunctionExpressionInstruction(
      this.id,
      this.place,
      this.nodePath,
      newIdentifier,
      this.functionIR,
      this.generator,
      this.async,
      newCaptures,
    );
  }

  public getReadPlaces(): Place[] {
    return this.captures;
  }

  public override getWrittenPlaces(): Place[] {
    return [this.place];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
