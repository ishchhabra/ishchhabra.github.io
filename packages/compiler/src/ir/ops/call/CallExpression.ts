import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a call expression.
 *
 * Example:
 * foo(1, 2)
 */
export class CallExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly callee: Place,
    // Using args instead of arguments since arguments is a reserved word
    public readonly args: Place[],
    public readonly optional: boolean = false,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): CallExpressionOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      CallExpressionOp,
      place,
      this.callee,
      this.args,
      this.optional,
    );
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    return new CallExpressionOp(
      this.id,
      this.place,
      values.get(this.callee.identifier) ?? this.callee,
      this.args.map((arg) => values.get(arg.identifier) ?? arg),
      this.optional,
    );
  }

  getOperands(): Place[] {
    return [this.callee, ...this.args];
  }

  public override print(): string {
    return `${this.place.print()} = Call ${this.callee.print()}(${this.args.map((a) => a.print()).join(", ")})`;
  }
}
