import type { ModuleIR } from "../../core/ModuleIR";
import {
  Place,
  destructureTargetHasObservableWrites,
  getDestructureTargetDefs,
  getDestructureTargetOperands,
  rewriteDestructureTarget,
  type DestructureObjectProperty,
  type Identifier,
} from "../../core";
import { BaseInstruction, InstructionId, MemoryInstruction } from "../../base";
import { ExpressionStatementInstruction } from "../ExpressionStatement";
import type { StoreLocalKind } from "./StoreLocal";

export class ObjectDestructureInstruction extends MemoryInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly properties: DestructureObjectProperty[],
    public readonly value: Place,
    public readonly kind: StoreLocalKind,
    public readonly declarationKind: "let" | "const" | "var" | null = null,
    public emit = true,
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): ObjectDestructureInstruction {
    const place = moduleIR.environment.createPlace(moduleIR.environment.createIdentifier());
    return moduleIR.environment.createInstruction(
      ObjectDestructureInstruction,
      place,
      this.properties,
      this.value,
      this.kind,
      this.declarationKind,
      this.emit,
    );
  }

  rewrite(
    values: Map<Identifier, Place>,
    { rewriteDefinitions = false }: { rewriteDefinitions?: boolean } = {},
  ): ObjectDestructureInstruction {
    return new ObjectDestructureInstruction(
      this.id,
      this.place,
      this.properties.map((property) => ({
        ...property,
        key:
          property.computed && property.key instanceof Place
            ? property.key.rewrite(values)
            : property.key,
        value: rewriteDestructureTarget(property.value, values, { rewriteDefinitions }),
      })),
      this.value.rewrite(values),
      this.kind,
      this.declarationKind,
      this.emit,
    );
  }

  getOperands(): Place[] {
    return [
      this.value,
      ...getDestructureTargetOperands({ kind: "object", properties: this.properties }),
    ];
  }

  override getDefs(): Place[] {
    return [this.place, ...getDestructureTargetDefs({ kind: "object", properties: this.properties })];
  }

  public override hasSideEffects(): boolean {
    return destructureTargetHasObservableWrites({ kind: "object", properties: this.properties });
  }

  override asSideEffect(): BaseInstruction | null {
    return this.hasSideEffects()
      ? null
      : new ExpressionStatementInstruction(this.id, this.place, this.value);
  }
}
