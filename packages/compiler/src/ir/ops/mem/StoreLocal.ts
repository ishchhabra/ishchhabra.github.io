import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
import { effects, localLocation, type MemoryEffects } from "../../memory/MemoryLocation";
export type StoreLocalKind = "declaration" | "assignment";

/**
 * Represents a memory instruction that stores a value at a given place.
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
    public readonly type: "let" | "const" | "var",
    public readonly kind: StoreLocalKind = "assignment",
    public readonly bindings: Value[] = [],
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
      this.type,
      this.kind,
      this.bindings,
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
      this.type,
      this.kind,
      rewriteDefinitions
        ? this.bindings.map((binding) => values.get(binding) ?? binding)
        : this.bindings,
    );
  }

  getOperands(): Value[] {
    // Mirror LLVM's `store addr, val`: the address is a use, the
    // value is a use, and the store itself produces no SSA value.
    // For assignment-kind stores, `lval` names the binding location
    // that must already exist — it's a use, not a def. For
    // declaration-kind stores, `lval` names the binding being
    // introduced; that's handled by `getDefs` below.
    return this.kind === "assignment" ? [this.value, this.lval] : [this.value];
  }

  override getDefs(): Value[] {
    // Declarations introduce the binding — `lval` is a new def,
    // analogous to `alloca`. Assignments do not produce a new
    // binding; they mutate memory at an existing `lval`, matching
    // `store`'s void return in LLVM.
    return this.kind === "assignment"
      ? [this.place, ...this.bindings]
      : [this.place, this.lval, ...this.bindings];
  }

  public override hasSideEffects(): boolean {
    // Both declarations and assignments write the binding cell.
    // Post-mem2reg, a declaration's LoadLocal readers get elided,
    // so SSA liveness can't keep the declaration alive. But the
    // binding is still observed by destructures / property-writes /
    // other multi-def ops that target the same cell; dropping the
    // declaration would leave them writing to an undeclared name.
    // DCE therefore preserves all StoreLocals unconditionally —
    // memory-aware DSE is the right pass to remove truly-dead
    // stores.
    return true;
  }

  public override getMemoryEffects(_env?: unknown): MemoryEffects {
    // Both declarations and assignments write the binding cell. A
    // declaration is the first write; assignments layer on top. The
    // cell identity is the lval's declarationId — stable across
    // versions (SSABuilder doesn't promote mutable bindings).
    return effects([], [localLocation(this.lval.declarationId)]);
  }

  public override print(): string {
    return `${this.place.print()} = store_local ${this.lval.print()}, ${this.value.print()} {kind = ${this.kind}}`;
  }
}
