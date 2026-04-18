import { Environment } from "../../../environment";
import { OperationId } from "../../core";
import { Value } from "../../core";

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
    public override readonly place: Value,
    public readonly operator: UnaryOperator,
    public readonly argument: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): UnaryExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(UnaryExpressionOp, place, this.operator, this.argument);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new UnaryExpressionOp(
      this.id,
      this.place,
      this.operator,
      values.get(this.argument) ?? this.argument,
    );
  }

  getOperands(): Value[] {
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
      const argInstr = this.argument.definer as Operation | undefined;
      return argInstr ? argInstr.hasSideEffects(environment) : false;
    }

    return false;
  }

  public override print(): string {
    return `${this.place.print()} = ${this.operator}${this.argument.print()}`;
  }
}
