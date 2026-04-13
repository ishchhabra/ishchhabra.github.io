import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export type BinaryOperator =
  | "=="
  | "!="
  | "==="
  | "!=="
  | "<"
  | "<="
  | ">"
  | ">="
  | "<<"
  | ">>"
  | ">>>"
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "**"
  | "|"
  | "^"
  | "&"
  | "in"
  | "instanceof";

/**
 * Represents a binary expression.
 *
 * Example:
 * 1 + 2
 */
export class BinaryExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly operator: BinaryOperator,
    public readonly left: Place,
    public readonly right: Place,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): BinaryExpressionOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      BinaryExpressionOp,
      place,
      this.operator,
      this.left,
      this.right,
    );
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    return new BinaryExpressionOp(
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
