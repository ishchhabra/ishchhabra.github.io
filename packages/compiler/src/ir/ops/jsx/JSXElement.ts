import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation, Trait } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a JSX element in the IR.
 *
 * Examples:
 * - `<div />`
 * - `<div>Hello, world!</div>`
 */
export class JSXElementOp extends Operation {
  static override readonly traits: ReadonlySet<Trait> = new Set([Trait.Pure]);

  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly openingElement: Value,
    public readonly closingElement: Value | undefined,
    public readonly children: Value[],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXElementOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(
      JSXElementOp,
      place,
      this.openingElement,
      this.closingElement,
      this.children,
    );
  }

  public rewrite(values: Map<Value, Value>): Operation {
    return new JSXElementOp(
      this.id,
      this.place,
      values.get(this.openingElement) ?? this.openingElement,
      this.closingElement ? (values.get(this.closingElement) ?? this.closingElement) : undefined,
      this.children.map((child) => values.get(child) ?? child),
    );
  }

  public operands(): Value[] {
    return [
      this.openingElement,
      ...(this.closingElement ? [this.closingElement] : []),
      ...this.children,
    ];
  }
}
