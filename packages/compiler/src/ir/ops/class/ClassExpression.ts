import { OperationId, Value } from "../../core";
import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";

export class ClassExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly name: string | null = null,
    public readonly superClass: Value | null = null,
    public readonly elements: Value[] = [],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ClassExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(ClassExpressionOp, place, this.name, this.superClass, this.elements);
  }

  rewrite(values: Map<Value, Value>): Operation {
    const newSuperClass = this.superClass ? this.superClass.rewrite(values) : null;
    const newElements = this.elements.map((element) => element.rewrite(values));
    const superChanged = newSuperClass !== this.superClass;
    const elementsChanged = newElements.some((e, i) => e !== this.elements[i]);
    if (!superChanged && !elementsChanged) return this;
    return new ClassExpressionOp(this.id, this.place, this.name, newSuperClass, newElements);
  }

  getOperands(): Value[] {
    const operands: Value[] = [];
    if (this.superClass !== null) operands.push(this.superClass);
    operands.push(...this.elements);
    return operands;
  }
}
