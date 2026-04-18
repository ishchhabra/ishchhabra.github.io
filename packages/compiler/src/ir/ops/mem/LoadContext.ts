import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents an instruction that loads a value from a context variable —
 * a mutable variable captured across closure boundaries. Semantically identical
 * to LoadLocalOp at codegen time, but treated differently by SSA
 * (skipped during phi placement and renaming) and by optimization passes
 * (loads are considered side-effecting because closures may mutate the value).
 */
export class LoadContextOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly value: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): LoadContextOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(LoadContextOp, place, this.value);
  }

  rewrite(values: Map<Value, Value>): Operation {
    const rewrittenTarget = values.get(this.value) ?? this.value;

    if (rewrittenTarget === this.value) {
      return this;
    }

    return new LoadContextOp(this.id, this.place, rewrittenTarget);
  }

  getOperands(): Value[] {
    return [this.value];
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `${this.place.print()} = LoadContext ${this.value.print()}`;
  }
}
