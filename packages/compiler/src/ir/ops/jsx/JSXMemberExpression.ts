import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a JSX member expression (compound tag name) in the IR.
 *
 * Examples:
 * - `Foo.Bar` in `<Foo.Bar>`
 * - `Foo.Bar.Baz` is represented as nested: JSXMemberExpression(JSXMemberExpression(Foo, Bar), Baz)
 */
export class JSXMemberExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly object: Value,
    public readonly property: string,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXMemberExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(JSXMemberExpressionOp, place, this.object, this.property);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new JSXMemberExpressionOp(
      this.id,
      this.place,
      values.get(this.object) ?? this.object,
      this.property,
    );
  }

  operands(): Value[] {
    return [this.object];
  }
}
