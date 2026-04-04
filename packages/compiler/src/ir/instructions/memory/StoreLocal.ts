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
  /**
   * Whether codegen should emit this as a standalone statement. When `false`,
   * codegen still populates `generator.places` but does not emit a
   * VariableDeclaration statement. Set to `false` by ExportDeclarationMergingPass
   * when the declaration is wrapped inside an ExportNamedDeclaration.
   */
  public emit: boolean = true;

  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly lval: Place,
    public readonly value: Place,
    public readonly type: "let" | "const" | "var",
    public readonly bindings: Place[] = [],
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
