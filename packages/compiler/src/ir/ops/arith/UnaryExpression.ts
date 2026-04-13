import { Environment } from "../../../environment";
import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export type UnaryOperator = "-" | "+" | "!" | "~" | "typeof" | "void" | "delete";

/**
 * Represents a unary expression.
 *
 * Example:
 * !a
 * delete a
 */
export class UnaryExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly operator: UnaryOperator,
    public readonly argument: Place,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): UnaryExpressionOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      UnaryExpressionOp,
      place,
      this.operator,
      this.argument,
    );
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    return new UnaryExpressionOp(
      this.id,
      this.place,
      this.operator,
      values.get(this.argument.identifier) ?? this.argument,
    );
  }

  getOperands(): Place[] {
    return [this.argument];
  }

  public override hasSideEffects(environment: Environment): boolean {
    if (["throw", "delete"].includes(this.operator)) {
      return true;
    }

    // `void expr` evaluates its operand then discards the result.
    // The void itself is pure, but if the operand is side-effectful
    // (e.g. `void fetch(url)`) the overall expression is too.
    if (this.operator === "void") {
      const argInstr = environment.placeToOp.get(this.argument.id);
      return argInstr ? argInstr.hasSideEffects(environment) : false;
    }

    return false;
  }

  public override print(): string {
    return `${this.place.print()} = ${this.operator}${this.argument.print()}`;
  }
}
