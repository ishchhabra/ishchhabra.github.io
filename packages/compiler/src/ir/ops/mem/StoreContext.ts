import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
import { contextLocation, effects, type MemoryEffects } from "../../memory/MemoryLocation";
export type StoreContextKind = "declaration" | "assignment";

/**
 * Represents a memory instruction that stores a value to a context variable —
 * a mutable variable captured across closure boundaries. Semantically identical
 * to StoreLocalOp at codegen time, but treated differently by SSA
 * (skipped during phi placement and renaming) and by optimization passes
 * (stores are considered side-effecting because closures may observe them).
 */
export class StoreContextOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly lval: Value,
    public readonly value: Value,
    public readonly type: "let" | "var",
    public readonly kind: StoreContextKind,
    public readonly bindings: Value[] = [],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): StoreContextOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(
      StoreContextOp,
      place,
      this.lval,
      this.value,
      this.type,
      this.kind,
      this.bindings,
    );
  }

  rewrite(
    values: Map<Value, Value>,
    { rewriteDefinitions = false }: { rewriteDefinitions?: boolean } = {},
  ): StoreContextOp {
    const value = this.value.rewrite(values);
    const lval = this.lval.rewrite(values);

    let bindings = this.bindings;
    if (rewriteDefinitions && bindings.length) {
      const next = bindings.map((b) => b.rewrite(values));
      if (next.some((b, i) => b !== bindings[i])) bindings = next;
    }

    if (value === this.value && lval === this.lval && bindings === this.bindings) {
      return this;
    }

    return new StoreContextOp(this.id, this.place, lval, value, this.type, this.kind, bindings);
  }

  operands(): Value[] {
    return [this.lval, this.value];
  }

  override results(): Value[] {
    return [this.place, ...this.bindings];
  }

  // Five-axis effects:
  //  - writes: the context binding cell (see getMemoryEffects).
  //  - mayThrow=false. mayDiverge=false.
  //  - isDeterministic=true. isObservable=false (the write is
  //    captured as a memory effect; closures observing it are
  //    modeled as separate LoadContext reads).
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

  public override getMemoryEffects(_env?: unknown): MemoryEffects {
    return effects([], [contextLocation(this.lval.declarationId)]);
  }

  public override print(): string {
    return `${this.place.print()} = StoreContext ${this.lval.print()} = ${this.value.print()}`;
  }
}
