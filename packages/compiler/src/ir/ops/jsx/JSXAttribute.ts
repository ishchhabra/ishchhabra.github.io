import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a JSX attribute in the IR.
 *
 * Examples:
 * - `className={x}` (name="className", value=place for x)
 * - `disabled` (name="disabled", value=undefined)
 * - `foo="bar"` (name="foo", value=place for "bar")
 */
export class JSXAttributeOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly name: string,
    public readonly value: Place | undefined,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXAttributeOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(JSXAttributeOp, place, this.name, this.value);
  }

  public rewrite(values: Map<Identifier, Place>): Operation {
    return new JSXAttributeOp(
      this.id,
      this.place,
      this.name,
      this.value ? (values.get(this.value.identifier) ?? this.value) : undefined,
    );
  }

  public getOperands(): Place[] {
    return this.value ? [this.value] : [];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
