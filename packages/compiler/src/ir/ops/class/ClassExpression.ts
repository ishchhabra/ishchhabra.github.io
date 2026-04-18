import { OperationId, Value } from "../../core";
import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";

export class ClassExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    /** Optional bound name for `class Foo {}`. `null` for anonymous expressions. */
    public readonly binding: Value | null = null,
    public readonly superClass: Value | null = null,
    public readonly elements: Value[] = [],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ClassExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(
      ClassExpressionOp,
      place,
      this.binding,
      this.superClass,
      this.elements,
    );
  }

  rewrite(values: Map<Value, Value>): Operation {
    const newBinding = this.binding ? this.binding.rewrite(values) : null;
    const newSuperClass = this.superClass ? this.superClass.rewrite(values) : null;
    const newElements = this.elements.map((element) => element.rewrite(values));

    const bindingChanged = newBinding !== this.binding;
    const superChanged = newSuperClass !== this.superClass;
    const elementsChanged = newElements.some((e, i) => e !== this.elements[i]);
    if (!bindingChanged && !superChanged && !elementsChanged) {
      return this;
    }
    return new ClassExpressionOp(this.id, this.place, newBinding, newSuperClass, newElements);
  }

  getOperands(): Value[] {
    const operands: Value[] = [];
    if (this.superClass !== null) operands.push(this.superClass);
    operands.push(...this.elements);
    return operands;
  }
}
