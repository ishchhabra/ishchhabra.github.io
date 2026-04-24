import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a local variable declaration without initialization.
 *
 * This instruction declares a new local binding (e.g., `let x` or `const x`)
 * without assigning a value. The actual value assignment is handled by a
 * subsequent {@link StoreLocalOp}.
 *
 * @example
 * ```typescript
 * // `const x = 5` is lowered to:
 * // DeclareLocalOp(place, "const")  — declares `x`
 * // StoreLocalOp(place, lval, value) — assigns `5` to `x`
 * ```
 */
export class DeclareLocalOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly kind: "var" | "let" | "const",
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): DeclareLocalOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(DeclareLocalOp, place, this.kind);
  }

  rewrite(
    values: Map<Value, Value>,
    { rewriteDefinitions = false }: { rewriteDefinitions?: boolean } = {},
  ): DeclareLocalOp {
    return new DeclareLocalOp(
      this.id,
      rewriteDefinitions ? (values.get(this.place) ?? this.place) : this.place,
      this.kind,
    );
  }

  operands(): Value[] {
    return [];
  }

  override results(): Value[] {
    return [this.place];
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `DeclareLocal ${this.kind} ${this.place.print()}`;
  }
}
