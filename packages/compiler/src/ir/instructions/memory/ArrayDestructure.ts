import type { ModuleIR } from "../../core/ModuleIR";
import {
  destructureTargetHasObservableWrites,
  getDestructureTargetDefs,
  getDestructureTargetOperands,
  rewriteDestructureTarget,
  type DestructureTarget,
  type Identifier,
  type Place,
} from "../../core";
import { BaseInstruction, InstructionId, MemoryInstruction } from "../../base";
import { ExpressionStatementInstruction } from "../ExpressionStatement";
import type { StoreLocalKind } from "./StoreLocal";

export class ArrayDestructureInstruction extends MemoryInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly elements: Array<DestructureTarget | null>,
    public readonly value: Place,
    public readonly kind: StoreLocalKind,
    public readonly declarationKind: "let" | "const" | "var" | null = null,
    public emit = true,
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): ArrayDestructureInstruction {
    const place = moduleIR.environment.createPlace(moduleIR.environment.createIdentifier());
    return moduleIR.environment.createInstruction(
      ArrayDestructureInstruction,
      place,
      this.elements,
      this.value,
      this.kind,
      this.declarationKind,
      this.emit,
    );
  }

  rewrite(
    values: Map<Identifier, Place>,
    { rewriteDefinitions = false }: { rewriteDefinitions?: boolean } = {},
  ): ArrayDestructureInstruction {
    return new ArrayDestructureInstruction(
      this.id,
      this.place,
      this.elements.map((element) =>
        element === null
          ? null
          : rewriteDestructureTarget(element, values, { rewriteDefinitions }),
      ),
      this.value.rewrite(values),
      this.kind,
      this.declarationKind,
      this.emit,
    );
  }

  getOperands(): Place[] {
    return [
      this.value,
      ...getDestructureTargetOperands({ kind: "array", elements: this.elements }),
    ];
  }

  override getDefs(): Place[] {
    return [this.place, ...getDestructureTargetDefs({ kind: "array", elements: this.elements })];
  }

  public override hasSideEffects(): boolean {
    return destructureTargetHasObservableWrites({ kind: "array", elements: this.elements });
  }

  override asSideEffect(): BaseInstruction | null {
    return this.hasSideEffects()
      ? null
      : new ExpressionStatementInstruction(this.id, this.place, this.value);
  }
}
