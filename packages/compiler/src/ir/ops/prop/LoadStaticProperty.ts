import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * An instruction that loads a **static** property for an object:
 * `object[0]` or `object.foo`.
 */
export class LoadStaticPropertyOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly object: Value,
    public readonly property: string,
    public readonly optional: boolean = false,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): LoadStaticPropertyOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(
      LoadStaticPropertyOp,
      place,
      this.object,
      this.property,
      this.optional,
    );
  }

  rewrite(values: Map<Value, Value>): LoadStaticPropertyOp {
    return new LoadStaticPropertyOp(
      this.id,
      this.place,
      values.get(this.object) ?? this.object,
      this.property,
      this.optional,
    );
  }

  getOperands(): Value[] {
    return [this.object];
  }

  public override print(): string {
    return `${this.place.print()} = ${this.object.print()}.${this.property}`;
  }
}
