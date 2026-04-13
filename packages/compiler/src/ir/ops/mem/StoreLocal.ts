import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
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
    public override readonly place: Place,
    public readonly lval: Place,
    public readonly value: Place,
    public readonly type: "let" | "const" | "var",
    public readonly kind: StoreLocalKind = "assignment",
    public readonly bindings: Place[] = [],
    /**
     * Whether codegen should emit this as a standalone statement. When `false`,
     * codegen still populates `generator.places` but does not emit a
     * VariableDeclaration statement. Set to `false` by export merging when the
     * declaration is wrapped by an export declaration.
     */
    public emit = true,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): StoreLocalOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      StoreLocalOp,
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
  ): StoreLocalOp {
    return new StoreLocalOp(
      this.id,
      this.place,
      rewriteDefinitions ? (values.get(this.lval.identifier) ?? this.lval) : this.lval,
      values.get(this.value.identifier) ?? this.value,
      this.type,
      this.kind,
      rewriteDefinitions
        ? this.bindings.map((binding) => values.get(binding.identifier) ?? binding)
        : this.bindings,
      this.emit,
    );
  }

  getOperands(): Place[] {
    return [this.value];
  }

  override getDefs(): Place[] {
    return [this.place, this.lval, ...this.bindings];
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `${this.place.print()} = StoreLocal(${this.kind}) ${this.lval.print()} = ${this.value.print()}`;
  }
}
