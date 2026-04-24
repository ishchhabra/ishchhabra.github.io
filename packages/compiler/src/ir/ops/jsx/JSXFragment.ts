import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a JSX fragment in the IR.
 *
 * Examples:
 * - `<></>`
 * - `<>{foo}</>`
 */
export class JSXFragmentOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly openingFragment: Value,
    public readonly closingFragment: Value,
    public readonly children: Value[],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXFragmentOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(
      JSXFragmentOp,
      place,
      this.openingFragment,
      this.closingFragment,
      this.children,
    );
  }

  rewrite(values: Map<Value, Value>): JSXFragmentOp {
    return new JSXFragmentOp(
      this.id,
      this.place,
      this.openingFragment,
      this.closingFragment,
      this.children.map((child) => values.get(child) ?? child),
    );
  }

  operands(): Value[] {
    return [this.openingFragment, this.closingFragment, ...this.children];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
