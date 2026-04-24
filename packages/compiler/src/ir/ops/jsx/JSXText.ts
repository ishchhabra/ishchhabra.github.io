import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a JSX text node in the IR.
 *
 * Examples:
 * - `"Hello, world!"`
 */
export class JSXTextOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly value: string,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXTextOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(JSXTextOp, place, this.value);
  }

  rewrite(): Operation {
    // JSXText can not be rewritten.
    return this;
  }

  operands(): Value[] {
    return [];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
