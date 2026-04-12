import type { ModuleIR } from "../../core/ModuleIR";
import { InstructionId, MemoryInstruction } from "../../base";
import { Identifier, Place } from "../../core";

export type StoreContextKind = "declaration" | "assignment";

/**
 * Represents a memory instruction that stores a value to a context variable —
 * a mutable variable captured across closure boundaries. Semantically identical
 * to StoreLocalInstruction at codegen time, but treated differently by SSA
 * (skipped during phi placement and renaming) and by optimization passes
 * (stores are considered side-effecting because closures may observe them).
 */
export class StoreContextInstruction extends MemoryInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly lval: Place,
    public readonly value: Place,
    public readonly type: "let" | "var",
    public readonly kind: StoreContextKind,
    public readonly bindings: Place[] = [],
    public emit = true,
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): StoreContextInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      StoreContextInstruction,
      place,
      this.lval,
      this.value,
      this.type,
      this.kind,
      this.bindings,
      this.emit,
    );
  }

  rewrite(
    values: Map<Identifier, Place>,
    { rewriteDefinitions = false }: { rewriteDefinitions?: boolean } = {},
  ): StoreContextInstruction {
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

    return new StoreContextInstruction(
      this.id,
      this.place,
      lval,
      value,
      this.type,
      this.kind,
      bindings,
      this.emit,
    );
  }

  getOperands(): Place[] {
    return [this.lval, this.value];
  }

  override getDefs(): Place[] {
    return [this.place, ...this.bindings];
  }

  public override print(): string {
    return `${this.place.print()} = StoreContext ${this.lval.print()} = ${this.value.print()}`;
  }
}
