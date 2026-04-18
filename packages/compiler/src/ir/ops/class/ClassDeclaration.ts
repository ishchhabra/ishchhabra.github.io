import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Named class declaration at statement level (`class C extends B { ... }`).
 * Anonymous classes and `let`/context class bindings stay as
 * {@link ClassExpressionOp} + {@link StoreLocalOp}.
 */
export class ClassDeclarationOp extends Operation {
  constructor(
    public readonly id: import("../../core").OperationId,
    public override readonly place: Value,
    public readonly superClass: Value | null,
    public readonly elements: Value[],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ClassDeclarationOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(ClassDeclarationOp, place, this.superClass, this.elements);
  }

  public rewrite(
    values: Map<Value, Value>,
    _options?: { rewriteDefinitions?: boolean },
  ): Operation {
    const newSuper = this.superClass ? this.superClass.rewrite(values) : null;
    const newElements = this.elements.map((e) => e.rewrite(values));
    const superChanged = newSuper !== this.superClass;
    const elementsChanged = newElements.some((e, i) => e !== this.elements[i]);
    if (!superChanged && !elementsChanged) {
      return this;
    }
    return new ClassDeclarationOp(this.id, this.place, newSuper, newElements);
  }

  public getOperands(): Value[] {
    const operands: Value[] = [];
    if (this.superClass !== null) operands.push(this.superClass);
    operands.push(...this.elements);
    return operands;
  }

  public override getDefs(): Value[] {
    return [this.place];
  }
}
