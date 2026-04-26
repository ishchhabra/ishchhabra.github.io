import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation, Trait } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a JSX opening fragment in the IR.
 *
 * Examples:
 * - `<>`
 */
export class JSXOpeningFragmentOp extends Operation {
  static override readonly traits: ReadonlySet<Trait> = new Set([Trait.Pure]);

  constructor(
    id: OperationId,
    public override readonly place: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXOpeningFragmentOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(JSXOpeningFragmentOp, place);
  }

  rewrite(): Operation {
    return this;
  }

  operands(): Value[] {
    return [];
  }
}
