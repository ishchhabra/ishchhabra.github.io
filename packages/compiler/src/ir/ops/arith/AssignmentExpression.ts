import { OperationId, Value } from "../../core";
import type { CloneContext } from "../../core/Operation";
import { Operation } from "../../core/Operation";
import {
  computedPropertyLocation,
  contextLocation,
  effects,
  localLocation,
  staticPropertyLocation,
  type MemoryEffects,
} from "../../memory/MemoryLocation";

export type AssignmentOperator =
  | "="
  | "+="
  | "-="
  | "*="
  | "/="
  | "%="
  | "**="
  | "<<="
  | ">>="
  | ">>>="
  | "|="
  | "^="
  | "&=";

export type AssignmentTarget =
  | { readonly kind: "local"; readonly binding: Value }
  | { readonly kind: "context"; readonly binding: Value }
  | { readonly kind: "static-property"; readonly object: Value; readonly property: string }
  | { readonly kind: "dynamic-property"; readonly object: Value; readonly property: Value };

export class AssignmentExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly operator: AssignmentOperator,
    public readonly target: AssignmentTarget,
    public readonly value: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): AssignmentExpressionOp {
    const env = ctx.environment;
    return env.createOperation(
      AssignmentExpressionOp,
      env.createValue(),
      this.operator,
      rewriteTarget(this.target, ctx.valueMap),
      ctx.valueMap.get(this.value) ?? this.value,
    );
  }

  rewrite(values: Map<Value, Value>): AssignmentExpressionOp {
    return new AssignmentExpressionOp(
      this.id,
      this.place,
      this.operator,
      rewriteTarget(this.target, values),
      values.get(this.value) ?? this.value,
    );
  }

  operands(): Value[] {
    switch (this.target.kind) {
      case "local":
      case "context":
        return [this.target.binding, this.value];
      case "static-property":
        return [this.target.object, this.value];
      case "dynamic-property":
        return [this.target.object, this.target.property, this.value];
    }
  }

  public override mayThrow(): boolean {
    return this.target.kind === "static-property" || this.target.kind === "dynamic-property";
  }

  public override mayDiverge(): boolean {
    return false;
  }

  public override get isDeterministic(): boolean {
    return true;
  }

  public override isObservable(): boolean {
    return false;
  }

  public override getMemoryEffects(): MemoryEffects {
    switch (this.target.kind) {
      case "local": {
        const location = localLocation(this.target.binding.declarationId);
        return effects([location], [location]);
      }
      case "context": {
        const location = contextLocation(this.target.binding.declarationId);
        return effects([location], [location]);
      }
      case "static-property": {
        const location = staticPropertyLocation(this.target.object, this.target.property);
        return effects([location], [location]);
      }
      case "dynamic-property": {
        const location = computedPropertyLocation(this.target.object);
        return effects([location], [location]);
      }
    }
  }

  public override print(): string {
    return `${this.place.print()} = assignment "${this.operator}" ${printTarget(this.target)}, ${this.value.print()}`;
  }
}

function rewriteTarget(target: AssignmentTarget, values: Map<Value, Value>): AssignmentTarget {
  switch (target.kind) {
    case "local":
      return { kind: "local", binding: values.get(target.binding) ?? target.binding };
    case "context":
      return { kind: "context", binding: values.get(target.binding) ?? target.binding };
    case "static-property":
      return {
        kind: "static-property",
        object: values.get(target.object) ?? target.object,
        property: target.property,
      };
    case "dynamic-property":
      return {
        kind: "dynamic-property",
        object: values.get(target.object) ?? target.object,
        property: values.get(target.property) ?? target.property,
      };
  }
}

function printTarget(target: AssignmentTarget): string {
  switch (target.kind) {
    case "local":
    case "context":
      return target.binding.print();
    case "static-property":
      return `${target.object.print()}.${target.property}`;
    case "dynamic-property":
      return `${target.object.print()}[${target.property.print()}]`;
  }
}
