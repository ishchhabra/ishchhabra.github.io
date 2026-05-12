import { BasicBlock } from "../../core/Block";
import { OperationId } from "../../core/Operation";
import { OperationCloneContext } from "../../core/OperationCloneContext";
import {
  BlockTarget,
  cloneBlockTarget,
  replaceSuccessorValues,
  successorValues,
  TerminatorOp,
} from "../../core/TerminatorOp";
import { Value } from "../../core/Value";
import { OperationEffects, PureOperationEffects } from "../../effects";

export type ShortCircuitOperator = "&&" | "||" | "??";

/**
 * Structured value terminator for ECMAScript short-circuit operators.
 *
 * The `test` value is the already-evaluated left operand. Depending on
 * `operator` and the ECMAScript short-circuit rule, control either enters
 * `bodyTarget` to evaluate the right operand or exits through `exitTarget`
 * with the left operand as the expression result.
 *
 * `exitTarget` is the structured continuation of the expression region. It
 * carries the short-circuit result as successor operands, usually `[test]`.
 *
 * @example
 * ```js
 * const value = left && right;
 * ```
 *
 * For `&&`, truthy `test` evaluates the right operand; falsy `test` exits.
 * For `||`, falsy `test` evaluates the right operand; truthy `test` exits.
 * For `??`, nullish `test` evaluates the right operand; non-nullish `test`
 * exits.
 */
export class ShortCircuitTerminatorOp extends TerminatorOp {
  constructor(
    id: OperationId,
    public readonly operator: ShortCircuitOperator,
    public readonly test: Value,
    public readonly bodyTarget: BlockTarget,
    public readonly exitTarget: BlockTarget,
  ) {
    super(id);
  }

  public get bodyBlock(): BasicBlock {
    return this.bodyTarget.block;
  }

  public get exitBlock(): BasicBlock {
    return this.exitTarget.block;
  }

  public override operands(): readonly Value[] {
    return [this.test, ...successorValues(this.bodyTarget), ...successorValues(this.exitTarget)];
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): ShortCircuitTerminatorOp {
    const bodyValues = successorValues(this.bodyTarget);
    const exitValues = successorValues(this.exitTarget);
    const expected = 1 + bodyValues.length + exitValues.length;

    if (operands.length !== expected) {
      throw new Error(
        `ShortCircuitTerminatorOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const [test, ...successorOperands] = operands;
    const bodyTarget = replaceSuccessorValues(
      this.bodyTarget,
      successorOperands.slice(0, bodyValues.length),
    );
    const exitTarget = replaceSuccessorValues(
      this.exitTarget,
      successorOperands.slice(bodyValues.length),
    );

    if (test === this.test && bodyTarget === this.bodyTarget && exitTarget === this.exitTarget) {
      return this;
    }

    return new ShortCircuitTerminatorOp(this.id, this.operator, test, bodyTarget, exitTarget);
  }

  public override clone(context: OperationCloneContext): ShortCircuitTerminatorOp {
    return new ShortCircuitTerminatorOp(
      context.ids.operationId(),
      this.operator,
      context.value(this.test),
      cloneBlockTarget(context, this.bodyTarget),
      cloneBlockTarget(context, this.exitTarget),
    );
  }

  public override targetCount(): number {
    return 2;
  }

  public override target(index: number): BlockTarget {
    if (index === 0) return this.bodyTarget;
    if (index === 1) return this.exitTarget;

    throw new Error(`ShortCircuitTerminatorOp#${this.id} has no target ${index}`);
  }

  public override withTarget(index: number, target: BlockTarget): ShortCircuitTerminatorOp {
    if (index === 0) {
      return new ShortCircuitTerminatorOp(
        this.id,
        this.operator,
        this.test,
        target,
        this.exitTarget,
      );
    }

    if (index === 1) {
      return new ShortCircuitTerminatorOp(
        this.id,
        this.operator,
        this.test,
        this.bodyTarget,
        target,
      );
    }

    throw new Error(`ShortCircuitTerminatorOp#${this.id} has no target ${index}`);
  }
}
