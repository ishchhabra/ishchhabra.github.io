import { OperationId } from "../../core";
import { Value } from "../../core";

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
    public override readonly place: Value,
    public readonly name: string,
    public readonly value: Value | undefined,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXAttributeOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(JSXAttributeOp, place, this.name, this.value);
  }

  public rewrite(values: Map<Value, Value>): Operation {
    return new JSXAttributeOp(
      this.id,
      this.place,
      this.name,
      this.value ? (values.get(this.value) ?? this.value) : undefined,
    );
  }

  public operands(): Value[] {
    return this.value ? [this.value] : [];
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
