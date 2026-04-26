import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation, Trait } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a JSX closing element in the IR.
 *
 * Examples:
 * - `</div>`
 * - `</MyComponent>`
 */
export class JSXClosingElementOp extends Operation {
  static override readonly traits: ReadonlySet<Trait> = new Set([Trait.Pure]);

  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly tagPlace: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXClosingElementOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(JSXClosingElementOp, place, this.tagPlace);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new JSXClosingElementOp(this.id, this.place, values.get(this.tagPlace) ?? this.tagPlace);
  }

  operands(): Value[] {
    return [this.tagPlace];
  }
}
