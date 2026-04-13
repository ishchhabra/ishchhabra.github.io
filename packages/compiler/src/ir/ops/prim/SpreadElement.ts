import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";
import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a spread element in the IR.
 *
 * Examples:
 * - `...foo`
 * - `...[1, 2, 3]`
 */
export class SpreadElementOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly argument: Place,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): SpreadElementOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(SpreadElementOp, place, this.argument);
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    return new SpreadElementOp(
      this.id,
      this.place,
      values.get(this.argument.identifier) ?? this.argument,
    );
  }

  getOperands(): Place[] {
    return [this.argument];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
