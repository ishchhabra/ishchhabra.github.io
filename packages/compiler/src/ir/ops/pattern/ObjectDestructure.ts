import {
  Place,
  destructureTargetHasObservableWrites,
  getDestructureTargetDefs,
  getDestructureTargetOperands,
  rewriteDestructureTarget,
  type DestructureObjectProperty,
  type Identifier,
} from "../../core";
import { OperationId } from "../../core";
import type { StoreLocalKind } from "../mem/StoreLocal";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class ObjectDestructureOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly properties: DestructureObjectProperty[],
    public readonly value: Place,
    public readonly kind: StoreLocalKind,
    public readonly declarationKind: "let" | "const" | "var" | null = null,
    public emit = true,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ObjectDestructureOp {
    const moduleIR = ctx.moduleIR;
    const place = moduleIR.environment.createPlace(moduleIR.environment.createIdentifier());
    return moduleIR.environment.createOperation(
      ObjectDestructureOp,
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
  ): ObjectDestructureOp {
    return new ObjectDestructureOp(
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
    return [
      this.place,
      ...getDestructureTargetDefs({ kind: "object", properties: this.properties }),
    ];
  }

  public override hasSideEffects(): boolean {
    return destructureTargetHasObservableWrites({ kind: "object", properties: this.properties });
  }
}
