import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { FunctionIR } from "../../core/FunctionIR";
import { Identifier } from "../../core/Identifier";
import { Place } from "../../core/Place";

/**
 * Represents an arrow function expression, e.g.
 *   `const arrow = (x) => x + 1;`
 *
 * `captures` are the outer-scope Places this closure reads from,
 * aligned by index with `functionIR.captureParams`. Codegen binds
 * `captureParams[i]` → `captures[i]` so the function body resolves
 * captured variables through the indirection layer.
 */
export class ArrowFunctionExpressionInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly functionIR: FunctionIR,
    public readonly async: boolean,
    public readonly expression: boolean,
    public readonly generator: boolean,
    public readonly captures: Place[] = [],
  ) {
    super(id, place);
  }

  public clone(environment: Environment): ArrowFunctionExpressionInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      ArrowFunctionExpressionInstruction,
      place,
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
      this.functionIR,
      this.async,
      this.expression,
      this.generator,
      newCaptures,
    );
  }

  public getReadPlaces(): Place[] {
    return this.captures;
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
