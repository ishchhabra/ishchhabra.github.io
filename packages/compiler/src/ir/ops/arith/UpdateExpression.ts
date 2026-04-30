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
import type { AssignmentTarget } from "./AssignmentExpression";

export type UpdateOperator = "++" | "--";

export class UpdateExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly operator: UpdateOperator,
    public readonly target: AssignmentTarget,
    public readonly prefix: boolean,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): UpdateExpressionOp {
    const env = ctx.environment;
    return env.createOperation(
      UpdateExpressionOp,
      env.createValue(),
      this.operator,
      rewriteTarget(this.target, ctx.valueMap),
      this.prefix,
    );
  }

  rewrite(values: Map<Value, Value>): UpdateExpressionOp {
    return new UpdateExpressionOp(
      this.id,
      this.place,
      this.operator,
      rewriteTarget(this.target, values),
      this.prefix,
    );
  }

  operands(): Value[] {
    switch (this.target.kind) {
      case "local":
      case "context":
        return [this.target.binding];
      case "static-property":
        return [this.target.object];
      case "dynamic-property":
        return [this.target.object, this.target.property];
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
    return `${this.place.print()} = update "${this.operator}" ${printTarget(this.target)} ${this.prefix ? "prefix" : "postfix"}`;
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
