import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, MemoryInstruction } from "../../base";
import { Identifier, Place } from "../../core";
import { ExpressionStatementInstruction } from "../ExpressionStatement";

/**
 * Represents a memory instruction that stores a value at a given place.
 *
 * @example
 * ```typescript
 * const x = 5;
 * ```
 */
export class StoreLocalInstruction extends MemoryInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly lval: Place,
    public readonly value: Place,
    public readonly type: "let" | "const" | "var",
    public readonly bindings: Place[] = [],
    /**
     * Whether codegen should emit this as a standalone statement. When `false`,
     * codegen still populates `generator.places` but does not emit a
     * VariableDeclaration statement. Set to `false` by export merging when the
     * declaration is wrapped by an export declaration.
     */
    public emit = true,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): StoreLocalInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      StoreLocalInstruction,
      place,
      this.lval,
      this.value,
      this.type,
      this.bindings,
      this.emit,
    );
  }

  rewrite(
    values: Map<Identifier, Place>,
    { rewriteDefinitions = false }: { rewriteDefinitions?: boolean } = {},
  ): StoreLocalInstruction {
    return new StoreLocalInstruction(
      this.id,
      this.place,
      rewriteDefinitions ? (values.get(this.lval.identifier) ?? this.lval) : this.lval,
      values.get(this.value.identifier) ?? this.value,
      this.type,
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

  override asSideEffect(): BaseInstruction | null {
    return new ExpressionStatementInstruction(this.id, this.place, this.value);
  }

  public override print(): string {
    return `${this.place.print()} = StoreLocal ${this.lval.print()} = ${this.value.print()}`;
  }
}
