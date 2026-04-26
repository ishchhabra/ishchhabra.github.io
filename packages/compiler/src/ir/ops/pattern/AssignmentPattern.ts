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
  // Default-value carrier for parameters / destructure targets. The
  // structural op itself doesn't run the default; the default value
  // is a separate operand op with its own effects.

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

  public operands(): Value[] {
    return [this.right];
  }

  public override results(): Value[] {
    return [this.place, ...this.bindings];
  }

  public override getMemoryEffects(): import("../../memory/MemoryLocation").MemoryEffects {
    return { reads: [], writes: [] };
  }

  public override mayThrow(): boolean {
    return false;
  }

  public override mayDiverge(): boolean {
    return false;
  }

  public override get isDeterministic(): boolean {
    return true;
  }

  public override isObservable(): boolean {
    return false;
  }
}
