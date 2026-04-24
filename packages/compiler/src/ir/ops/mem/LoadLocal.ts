import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
import { effects, localLocation, type MemoryEffects } from "../../memory/MemoryLocation";
/**
 * Represents an instruction that loads a value from one place to another place.
 * This is used to move values between different memory locations in the IR.
 *
 * For example, when a variable is referenced, its value needs to be loaded from its storage location
 * to the place where it's being used.
 */
export class LoadLocalOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly value: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): LoadLocalOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(LoadLocalOp, place, this.value);
  }

  rewrite(values: Map<Value, Value>): Operation {
    const rewrittenTarget = values.get(this.value) ?? this.value;

    if (rewrittenTarget === this.value) {
      return this;
    }

    return new LoadLocalOp(this.id, this.place, rewrittenTarget);
  }

  operands(): Value[] {
    return [this.value];
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override getMemoryEffects(_env?: unknown): MemoryEffects {
    return effects([localLocation(this.value.declarationId)], []);
  }

  public override print(): string {
    return `${this.place.print()} = LoadLocal ${this.value.print()}`;
  }
}
