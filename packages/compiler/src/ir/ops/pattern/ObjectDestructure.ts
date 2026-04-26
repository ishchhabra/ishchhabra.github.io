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
    public readonly kind: "declaration" | "assignment",
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

  // Five-axis effects:
  //  - getMemoryEffects: declares binding writes (used by memory
  //    analyses); the per-axis booleans mirror the pre-five-axis
  //    decision so DCE drops dead binding-only destructures via
  //    the unused-result check.
  //  - mayThrow=false (preserves old hasSideEffects=false).
  //  - mayDiverge=false. isDeterministic=true.
  //  - isObservable: only when the destructure tree contains
  //    member-target writes (setters are externally visible).
  public override mayThrow(): boolean {
    return false;
  }
  public override mayDiverge(): boolean {
    return false;
  }
  public override get isDeterministic(): boolean {
    return true;
  }
  public override isObservable(): boolean {
    return destructureTargetHasObservableWrites({ kind: "object", properties: this.properties });
  }

  /**
   * Per-binding write locations — see ArrayDestructureOp's matching
   * method for the rationale.
   */
  public bindingWriteLocations(): MemoryLocation[] {
    const writes: MemoryLocation[] = [];
    collectDestructureBindingLocations({ kind: "object", properties: this.properties }, writes);
    return writes;
  }

  public override getMemoryEffects(_env?: unknown): MemoryEffects {
    return effects([], []);
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
