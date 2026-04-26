import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation, Trait } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export type TPrimitiveValue = string | number | boolean | null | undefined | bigint | symbol;

/**
 * Represents a literal value.
 *
 * Example:
 * 42
 * "hello"
 * true
 */
export class LiteralOp extends Operation {
  static override readonly traits: ReadonlySet<Trait> = new Set([Trait.Pure]);

  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly value: TPrimitiveValue,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): LiteralOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(LiteralOp, place, this.value);
  }

  rewrite(): Operation {
    // Literals can not be rewritten.
    return this;
  }

  operands(): Value[] {
    return [];
  }

  public override print(): string {
    return `${this.place.print()} = ${JSON.stringify(this.value)}`;
  }
}
