import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import {
  assignmentPatternOperands,
  cloneAssignmentPatternTarget,
  rewriteAssignmentPatternOperands,
  type AssignmentPatternTarget,
} from "../../core/DestructurePattern";
import type { Value } from "../../core/Value";
import { type OperationEffects, UnknownOperationEffects } from "../../effects";

/**
 * Runs ECMAScript assignment-pattern destructuring from a source value.
 *
 * The result is the assignment expression completion value.
 *
 * @example Binding assignment
 * ```js
 * ({ x } = obj);
 * ```
 * Assigns to existing binding `x` and evaluates to `obj`.
 *
 * @example Property assignment
 * ```js
 * ({ x: target.y } = obj);
 * ```
 * Assigns to property target `target.y`; this does not declare a binding.
 */
export class DestructureAssignmentOp extends Operation {
  constructor(
    id: OperationId,
    public readonly target: AssignmentPatternTarget,
    public readonly source: Value,
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return [this.source, ...assignmentPatternOperands(this.target)];
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): DestructureAssignmentOp {
    const expected = this.operands().length;
    if (operands.length !== expected) {
      throw new Error(
        `DestructureAssignmentOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const [source, ...targetOperands] = operands;

    return new DestructureAssignmentOp(
      this.id,
      rewriteAssignmentPatternOperands(this.target, targetOperands),
      source,
      this.result,
    );
  }

  public override clone(context: OperationCloneContext): DestructureAssignmentOp {
    return new DestructureAssignmentOp(
      context.ids.operationId(),
      cloneAssignmentPatternTarget(context, this.target),
      context.value(this.source),
      context.value(this.result),
    );
  }
}
