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

/**
 * Structured value terminator for nullish-guarded evaluation.
 *
 * The `guard` value is evaluated before this terminator. If it is not nullish,
 * control enters `bodyTarget` to evaluate the guarded body. If it is nullish,
 * control exits through `exitTarget`, forwarding the fallback expression value.
 */
export class NullishGuardTerminatorOp extends TerminatorOp {
  constructor(
    id: OperationId,
    public readonly guard: Value,
    public readonly bodyTarget: BlockTarget,
    public readonly exitTarget: BlockTarget,
    public readonly completionBlock: BasicBlock,
  ) {
    super(id);
  }

  public get bodyBlock(): BasicBlock {
    return this.bodyTarget.block;
  }

  public override operands(): readonly Value[] {
    return [this.guard, ...successorValues(this.bodyTarget), ...successorValues(this.exitTarget)];
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): NullishGuardTerminatorOp {
    const bodyValues = successorValues(this.bodyTarget);
    const exitValues = successorValues(this.exitTarget);
    const expected = 1 + bodyValues.length + exitValues.length;

    if (operands.length !== expected) {
      throw new Error(
        `NullishGuardTerminatorOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const [guard, ...successorOperands] = operands;
    const bodyTarget = replaceSuccessorValues(
      this.bodyTarget,
      successorOperands.slice(0, bodyValues.length),
    );
    const exitTarget = replaceSuccessorValues(
      this.exitTarget,
      successorOperands.slice(bodyValues.length),
    );

    if (guard === this.guard && bodyTarget === this.bodyTarget && exitTarget === this.exitTarget) {
      return this;
    }

    return new NullishGuardTerminatorOp(
      this.id,
      guard,
      bodyTarget,
      exitTarget,
      this.completionBlock,
    );
  }

  public override clone(context: OperationCloneContext): NullishGuardTerminatorOp {
    return new NullishGuardTerminatorOp(
      context.ids.operationId(),
      context.value(this.guard),
      cloneBlockTarget(context, this.bodyTarget),
      cloneBlockTarget(context, this.exitTarget),
      context.block(this.completionBlock),
    );
  }

  public override targetCount(): number {
    return 2;
  }

  public override target(index: number): BlockTarget {
    if (index === 0) return this.bodyTarget;
    if (index === 1) return this.exitTarget;

    throw new Error(`NullishGuardTerminatorOp#${this.id} has no target ${index}`);
  }

  public override withTarget(index: number, target: BlockTarget): NullishGuardTerminatorOp {
    if (index === 0) {
      return new NullishGuardTerminatorOp(
        this.id,
        this.guard,
        target,
        this.exitTarget,
        this.completionBlock,
      );
    }

    if (index === 1) {
      return new NullishGuardTerminatorOp(
        this.id,
        this.guard,
        this.bodyTarget,
        target,
        this.completionBlock,
      );
    }

    throw new Error(`NullishGuardTerminatorOp#${this.id} has no target ${index}`);
  }
}
