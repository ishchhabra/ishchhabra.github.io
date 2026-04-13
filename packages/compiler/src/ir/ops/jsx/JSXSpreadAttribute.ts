import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a JSX spread attribute in the IR.
 *
 * Examples:
 * - `{...props}` (argument=place for props)
 * - `{...getProps()}` (argument=place for getProps())
 */
export class JSXSpreadAttributeOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly argument: Place,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXSpreadAttributeOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(JSXSpreadAttributeOp, place, this.argument);
  }

  public rewrite(values: Map<Identifier, Place>): Operation {
    return new JSXSpreadAttributeOp(
      this.id,
      this.place,
      values.get(this.argument.identifier) ?? this.argument,
    );
  }

  public getOperands(): Place[] {
    return [this.argument];
  }
}
