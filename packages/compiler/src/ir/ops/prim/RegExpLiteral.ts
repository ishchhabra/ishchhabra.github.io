import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation, Trait } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class RegExpLiteralOp extends Operation {
  static override readonly traits: ReadonlySet<Trait> = new Set([Trait.Pure]);

  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly pattern: string,
    public readonly flags: string,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): RegExpLiteralOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(RegExpLiteralOp, place, this.pattern, this.flags);
  }

  rewrite(): Operation {
    return this;
  }

  operands(): Value[] {
    return [];
  }

}
