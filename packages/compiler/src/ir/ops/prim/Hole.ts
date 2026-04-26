import { OperationId } from "../../core";
import { Value } from "../../core";
import { createOperationId } from "../../utils";

import { Operation, Trait } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a hole - an empty or missing value in an array.
 *
 * Example:
 * [1, , 3] // Second element is a hole
 */
export class HoleOp extends Operation {
  static override readonly traits: ReadonlySet<Trait> = new Set([Trait.Pure]);

  constructor(
    id: OperationId,
    public override readonly place: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): HoleOp {
    const env = ctx.environment;
    const place = env.createValue();
    const instructionId = createOperationId(env);
    return new HoleOp(instructionId, place);
  }

  rewrite(): Operation {
    // Hole can not be rewritten.
    return this;
  }

  operands(): Value[] {
    return [];
  }

}
