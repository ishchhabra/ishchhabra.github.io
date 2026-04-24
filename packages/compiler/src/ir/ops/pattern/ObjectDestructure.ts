import {
  OperationId,
  Value,
  destructureTargetHasObservableWrites,
  destructureTargetResults,
  destructureTargetOperands,
  rewriteDestructureTarget,
  type DestructureObjectProperty,
  type DestructureTarget,
} from "../../core";
import type { StoreLocalKind } from "../mem/StoreLocal";

import type { CloneContext } from "../../core/Operation";
import { Operation } from "../../core/Operation";
import {
  contextLocation,
  effects,
  localLocation,
  type MemoryEffects,
  type MemoryLocation,
} from "../../memory/MemoryLocation";
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

  operands(): Value[] {
    return [
      this.value,
      ...destructureTargetOperands({ kind: "object", properties: this.properties }),
    ];
  }

  override results(): Value[] {
    return [
      this.place,
      ...destructureTargetResults({ kind: "object", properties: this.properties }),
    ];
  }

  public override hasSideEffects(): boolean {
    return destructureTargetHasObservableWrites({ kind: "object", properties: this.properties });
  }

  public override getMemoryEffects(_env?: unknown): MemoryEffects {
    const writes: MemoryLocation[] = [];
    collectDestructureBindingLocations({ kind: "object", properties: this.properties }, writes);
    return effects([], writes);
  }

  public override print(): string {
    return `${this.place.print()} = object_destructure ${this.value.print()} {kind = ${this.kind}}`;
  }
}

function collectDestructureBindingLocations(
  target: DestructureTarget,
  out: MemoryLocation[],
): void {
  switch (target.kind) {
    case "binding":
      if (target.storage === "local") out.push(localLocation(target.place.declarationId));
      else out.push(contextLocation(target.place.declarationId));
      return;
    case "static-member":
    case "dynamic-member":
      return;
    case "assignment":
      collectDestructureBindingLocations(target.left, out);
      return;
    case "rest":
      collectDestructureBindingLocations(target.argument, out);
      return;
    case "array":
      for (const element of target.elements) {
        if (element !== null) collectDestructureBindingLocations(element, out);
      }
      return;
    case "object":
      for (const property of target.properties) {
        collectDestructureBindingLocations(property.value, out);
      }
      return;
  }
}
