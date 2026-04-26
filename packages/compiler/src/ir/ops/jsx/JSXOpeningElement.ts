import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation, Trait } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a JSX opening element in the IR.
 *
 * Examples:
 * - `<div className={x}>`
 * - `<MyComponent foo="bar" />`
 */
export class JSXOpeningElementOp extends Operation {
  static override readonly traits: ReadonlySet<Trait> = new Set([Trait.Pure]);

  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly tagPlace: Value,
    public readonly attributes: Value[],
    public readonly selfClosing: boolean,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXOpeningElementOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(
      JSXOpeningElementOp,
      place,
      this.tagPlace,
      this.attributes,
      this.selfClosing,
    );
  }

  public rewrite(values: Map<Value, Value>): Operation {
    return new JSXOpeningElementOp(
      this.id,
      this.place,
      values.get(this.tagPlace) ?? this.tagPlace,
      this.attributes.map((attr) => values.get(attr) ?? attr),
      this.selfClosing,
    );
  }

  public operands(): Value[] {
    return [this.tagPlace, ...this.attributes];
  }
}
