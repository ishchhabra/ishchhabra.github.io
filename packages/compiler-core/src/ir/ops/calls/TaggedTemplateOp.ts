import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import { UnknownOperationEffects, type OperationEffects } from "../../effects";
import type { TemplateElement } from "../literals/TemplateLiteralOp";
import {
  callTargetOperands,
  callTargetWithOperands,
  cloneCallTarget,
  sameCallTarget,
  type CallTarget,
} from "./CallOp";

/**
 * Calls a JavaScript tag function with a template literal site.
 *
 * Tagged templates are represented separately from normal calls because the
 * template object is created, cached, and frozen by ECMAScript semantics rather
 * than by a source-visible argument expression.
 */
export class TaggedTemplateOp extends Operation {
  constructor(
    id: OperationId,
    public readonly target: CallTarget,
    public readonly quasis: readonly TemplateElement[],
    public readonly expressions: readonly Value[],
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return [...callTargetOperands(this.target), ...this.expressions];
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): TaggedTemplateOp {
    const targetArity = callTargetOperands(this.target).length;
    if (operands.length !== targetArity + this.expressions.length) {
      throw new Error(
        `TaggedTemplateOp#${this.id} expected ${
          targetArity + this.expressions.length
        } operands, got ${operands.length}`,
      );
    }

    const target = callTargetWithOperands(this.target, operands.slice(0, targetArity));
    const expressions = operands.slice(targetArity);

    if (
      sameCallTarget(target, this.target) &&
      expressions.every((value, i) => value === this.expressions[i])
    ) {
      return this;
    }

    return new TaggedTemplateOp(this.id, target, this.quasis, expressions, this.result);
  }

  public override clone(context: OperationCloneContext): TaggedTemplateOp {
    return new TaggedTemplateOp(
      context.ids.operationId(),
      cloneCallTarget(context, this.target),
      this.quasis,
      this.expressions.map((value) => context.value(value)),
      context.result(this.result),
    );
  }
}
