import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

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
    public override readonly place: Place,
    public readonly kind: "var" | "let" | "const",
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): DeclareLocalOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(DeclareLocalOp, place, this.kind);
  }

  rewrite(
    values: Map<Identifier, Place>,
    { rewriteDefinitions = false }: { rewriteDefinitions?: boolean } = {},
  ): DeclareLocalOp {
    return new DeclareLocalOp(
      this.id,
      rewriteDefinitions ? (values.get(this.place.identifier) ?? this.place) : this.place,
      this.kind,
    );
  }

  getOperands(): Place[] {
    return [];
  }

  override getDefs(): Place[] {
    return [this.place];
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `DeclareLocal ${this.kind} ${this.place.print()}`;
  }
}
