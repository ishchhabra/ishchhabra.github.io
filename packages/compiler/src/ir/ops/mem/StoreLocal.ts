import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
import { effects, localLocation, type MemoryEffects } from "../../memory/MemoryLocation";

/**
 * Writes a value to an existing local binding.
 *
 * @example
 * ```typescript
 * const x = 5;
 * ```
 */
export class StoreLocalOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly lval: Value,
    public readonly value: Value,
    public readonly bindings: Value[] = [],
    public readonly binding: Value = lval,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): StoreLocalOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(
      StoreLocalOp,
      place,
      this.lval,
      this.value,
      this.bindings,
      this.binding,
    );
  }

  rewrite(
    values: Map<Value, Value>,
    { rewriteDefinitions = false }: { rewriteDefinitions?: boolean } = {},
  ): StoreLocalOp {
    return new StoreLocalOp(
      this.id,
      this.place,
      rewriteDefinitions ? (values.get(this.lval) ?? this.lval) : this.lval,
      values.get(this.value) ?? this.value,
      rewriteDefinitions
        ? this.bindings.map((binding) => values.get(binding) ?? binding)
        : this.bindings,
      rewriteDefinitions ? (values.get(this.binding) ?? this.binding) : this.binding,
    );
  }

  operands(): Value[] {
    return [this.value, this.binding];
  }

  override results(): Value[] {
    return [this.place, ...this.bindings];
  }

  public override hasSideEffects(): boolean {
    return true;
  }

  public override getMemoryEffects(_env?: unknown): MemoryEffects {
    return effects([], [localLocation(this.binding.declarationId)]);
  }

  public override print(): string {
    return `${this.place.print()} = store_local ${this.lval.print()}, ${this.value.print()}`;
  }
}
