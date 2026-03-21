import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { FunctionIR, rewriteFunctionIR } from "../../core/FunctionIR";
import { Identifier } from "../../core/Identifier";
import { Place } from "../../core/Place";

/**
 * Represents an arrow function expression, e.g.
 *   `const arrow = (x) => x + 1;`
 *
 * The `functionIR` property contains the IR for the arrow's body,
 * `async` indicates if it's `async ( ) => { }`,
 * `expression` indicates if it has a concise expression body rather than a block.
 */
export class ArrowFunctionExpressionInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly nodePath: NodePath<t.ArrowFunctionExpression> | undefined,
    public readonly functionIR: FunctionIR,
    public readonly async: boolean,
    public readonly expression: boolean,
    public readonly generator: boolean,
    public readonly captures: Place[] = [],
  ) {
    super(id, place, nodePath);
  }

  public clone(environment: Environment): ArrowFunctionExpressionInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      ArrowFunctionExpressionInstruction,
      place,
      this.nodePath,
      this.functionIR,
      this.async,
      this.expression,
      this.generator,
      this.captures,
    );
  }

  public rewrite(values: Map<Identifier, Place>): BaseInstruction {
    const newCaptures = this.captures.map((c) => c.rewrite(values));
    const capturesChanged = newCaptures.some((c, i) => c !== this.captures[i]);

    if (!capturesChanged) {
      return this;
    }

    return new ArrowFunctionExpressionInstruction(
      this.id,
      this.place,
      this.nodePath,
      rewriteFunctionIR(this.functionIR, values),
      this.async,
      this.expression,
      this.generator,
      newCaptures,
    );
  }

  public getReadPlaces(): Place[] {
    return this.captures;
  }

  public override get hasSideEffects(): boolean {
    return false;
  }
}
