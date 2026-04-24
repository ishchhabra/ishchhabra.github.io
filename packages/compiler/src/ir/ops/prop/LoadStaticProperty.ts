import { OperationId } from "../../core";
import { Value } from "../../core";
import type { CloneContext } from "../../core/Operation";
import { effects, staticPropertyLocation, type MemoryEffects } from "../../memory/MemoryLocation";
import { LoadPropertyOp } from "./LoadProperty";

/**
 * An instruction that loads a **static** property of an object:
 * `object.foo`, `object["literal"]`, or `object[0]` (numeric-literal
 * keys are folded to strings at HIR time).
 */
export class LoadStaticPropertyOp extends LoadPropertyOp {
  constructor(
    id: OperationId,
    place: Value,
    object: Value,
    public readonly property: string,
    optional: boolean = false,
  ) {
    super(id, place, object, optional);
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

  operands(): Value[] {
    return [this.object];
  }

  public override getMemoryEffects(_env?: unknown): MemoryEffects {
    return effects([staticPropertyLocation(this.object, this.property)], []);
  }

  public override print(): string {
    const attrs = this.optional ? ` {optional}` : "";
    return `${this.place.print()} = load_static_property ${this.object.print()}, "${this.property}"${attrs}`;
  }
}
