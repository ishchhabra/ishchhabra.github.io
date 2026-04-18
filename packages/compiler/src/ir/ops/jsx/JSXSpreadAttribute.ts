import { OperationId } from "../../core";
import { Value } from "../../core";

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
    public override readonly place: Value,
    public readonly argument: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXSpreadAttributeOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(JSXSpreadAttributeOp, place, this.argument);
  }

  public rewrite(values: Map<Value, Value>): Operation {
    return new JSXSpreadAttributeOp(
      this.id,
      this.place,
      values.get(this.argument) ?? this.argument,
    );
  }

  public getOperands(): Value[] {
    return [this.argument];
  }
}
