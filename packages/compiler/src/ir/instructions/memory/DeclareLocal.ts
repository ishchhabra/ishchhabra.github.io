import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
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
    public readonly nodePath: NodePath<t.Node> | undefined,
    public readonly kind: "var" | "let" | "const",
  ) {
    super(id, place, nodePath);
  }

  public clone(environment: Environment): DeclareLocalInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(DeclareLocalInstruction, place, this.nodePath, this.kind);
  }

  rewrite(
    values: Map<Identifier, Place>,
    { rewriteDefinitions = false }: { rewriteDefinitions?: boolean } = {},
  ): DeclareLocalInstruction {
    return new DeclareLocalInstruction(
      this.id,
      rewriteDefinitions ? (values.get(this.place.identifier) ?? this.place) : this.place,
      this.nodePath,
      this.kind,
    );
  }

  getReadPlaces(): Place[] {
    return [];
  }

  override getWrittenPlaces(): Place[] {
    return [this.place];
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  override asSideEffect(): BaseInstruction | null {
    return null;
  }

  public override print(): string {
    return `DeclareLocal ${this.kind} ${this.place.print()}`;
  }
}
