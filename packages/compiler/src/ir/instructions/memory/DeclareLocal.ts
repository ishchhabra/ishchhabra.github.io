import type { ModuleIR } from "../../core/ModuleIR";
import { BaseInstruction, InstructionId } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents a local variable declaration without initialization.
 *
 * This instruction declares a new local binding (e.g., `let x` or `const x`)
 * without assigning a value. The actual value assignment is handled by a
 * subsequent {@link StoreLocalInstruction}.
 *
 * @example
 * ```typescript
 * // `const x = 5` is lowered to:
 * // DeclareLocalInstruction(place, "const")  — declares `x`
 * // StoreLocalInstruction(place, lval, value) — assigns `5` to `x`
 * ```
 */
export class DeclareLocalInstruction extends BaseInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly kind: "var" | "let" | "const",
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): DeclareLocalInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(DeclareLocalInstruction, place, this.kind);
  }

  rewrite(
    values: Map<Identifier, Place>,
    { rewriteDefinitions = false }: { rewriteDefinitions?: boolean } = {},
  ): DeclareLocalInstruction {
    return new DeclareLocalInstruction(
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
