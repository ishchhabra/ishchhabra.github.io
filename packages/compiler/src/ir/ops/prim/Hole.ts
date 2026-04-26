import { OperationId } from "../../core";
import { Value } from "../../core";
import { createOperationId } from "../../utils";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a hole - an empty or missing value in an array.
 *
 * Example:
 * [1, , 3] // Second element is a hole
 */
export class HoleOp extends Operation {
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
