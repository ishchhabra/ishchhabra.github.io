import {
  Value,
  destructureTargetHasObservableWrites,
  getDestructureTargetDefs,
  getDestructureTargetOperands,
  rewriteDestructureTarget,
  type DestructureObjectProperty,
} from "../../core";
import { OperationId } from "../../core";
import type { StoreLocalKind } from "../mem/StoreLocal";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class ObjectDestructureOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly properties: DestructureObjectProperty[],
    public readonly value: Value,
    public readonly kind: StoreLocalKind,
    public readonly declarationKind: "let" | "const" | "var" | null = null,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ObjectDestructureOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(
      ObjectDestructureOp,
      place,
      this.properties,
      this.value,
      this.kind,
      this.declarationKind,
    );
  }

  rewrite(
    values: Map<Value, Value>,
    { rewriteDefinitions = false }: { rewriteDefinitions?: boolean } = {},
  ): ObjectDestructureOp {
    return new ObjectDestructureOp(
      this.id,
      this.place,
      this.properties.map((property) => ({
        ...property,
        key:
          property.computed && property.key instanceof Value
            ? property.key.rewrite(values)
            : property.key,
        value: rewriteDestructureTarget(property.value, values, { rewriteDefinitions }),
      })),
      this.value.rewrite(values),
      this.kind,
      this.declarationKind,
    );
  }

  getOperands(): Value[] {
    return [
      this.value,
      ...getDestructureTargetOperands({ kind: "object", properties: this.properties }),
    ];
  }

  override getDefs(): Value[] {
    return [
      this.place,
      ...getDestructureTargetDefs({ kind: "object", properties: this.properties }),
    ];
  }

  public override hasSideEffects(): boolean {
    return destructureTargetHasObservableWrites({ kind: "object", properties: this.properties });
  }
}
