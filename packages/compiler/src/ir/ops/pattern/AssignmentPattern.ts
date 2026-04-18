import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents an assignment pattern with a default value.
 *
 * Examples:
 * - `function foo(a = 1)` - Parameter default value
 * - `const {x = 1} = obj` - Destructuring with default value
 */
export class AssignmentPatternOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly left: Value,
    public readonly right: Value,
    public readonly bindings: Value[] = [],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): AssignmentPatternOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(AssignmentPatternOp, place, this.left, this.right, this.bindings);
  }

  public rewrite(values: Map<Value, Value>): Operation {
    return new AssignmentPatternOp(
      this.id,
      this.place,
      values.get(this.left) ?? this.left,
      values.get(this.right) ?? this.right,
      this.bindings.map((binding) => values.get(binding) ?? binding),
    );
  }

  public getOperands(): Value[] {
    return [this.right];
  }

  public override getDefs(): Value[] {
    return [this.place, ...this.bindings];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
