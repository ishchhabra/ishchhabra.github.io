import { type OperationEffects, PureOperationEffects } from "../../effects";
import { type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import {
  type BlockTarget,
  cloneBlockTarget,
  replaceSuccessorValues,
  successorValues,
  TerminatorOp,
} from "../../core/TerminatorOp";
import type { Value } from "../../core/Value";
import { BasicBlock } from "../../core/Block";

/**
 * Transfers control to one of two successor blocks based on a condition value.
 *
 * The condition is interpreted using ECMAScript truthiness. Successor operands
 * are forwarded to the selected block parameters in order.
 */
export class BranchTerminatorOp extends TerminatorOp {
  constructor(
    id: OperationId,
    public readonly condition: Value,
    public readonly trueTarget: BlockTarget,
    public readonly falseTarget: BlockTarget,
  ) {
    super(id);
  }

  public get trueBlock(): BasicBlock {
    return this.trueTarget.block;
  }

  public get falseBlock(): BasicBlock {
    return this.falseTarget.block;
  }

  public override operands(): readonly Value[] {
    return [
      this.condition,
      ...successorValues(this.trueTarget),
      ...successorValues(this.falseTarget),
    ];
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): BranchTerminatorOp {
    const trueValues = successorValues(this.trueTarget);
    const falseValues = successorValues(this.falseTarget);
    const expected = 1 + trueValues.length + falseValues.length;

    if (operands.length !== expected) {
      throw new Error(
        `BranchTerminatorOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const [condition, ...successorOperands] = operands;
    const trueTarget = replaceSuccessorValues(
      this.trueTarget,
      successorOperands.slice(0, trueValues.length),
    );
    const falseTarget = replaceSuccessorValues(
      this.falseTarget,
      successorOperands.slice(trueValues.length),
    );

    if (
      condition === this.condition &&
      trueTarget === this.trueTarget &&
      falseTarget === this.falseTarget
    ) {
      return this;
    }

    return new BranchTerminatorOp(this.id, condition, trueTarget, falseTarget);
  }

  public override clone(context: OperationCloneContext): BranchTerminatorOp {
    return new BranchTerminatorOp(
      context.ids.operationId(),
      context.value(this.condition),
      cloneBlockTarget(context, this.trueTarget),
      cloneBlockTarget(context, this.falseTarget),
    );
  }

  public override targetCount(): number {
    return 2;
  }

  public override target(index: number): BlockTarget {
    if (index === 0) return this.trueTarget;
    if (index === 1) return this.falseTarget;

    throw new Error(`BranchTerminatorOp#${this.id} has no target ${index}`);
  }

  public override withTarget(
    index: number,
    target: BlockTarget,
  ): BranchTerminatorOp {
    if (index === 0) {
      return new BranchTerminatorOp(
        this.id,
        this.condition,
        target,
        this.falseTarget,
      );
    }

    if (index === 1) {
      return new BranchTerminatorOp(
        this.id,
        this.condition,
        this.trueTarget,
        target,
      );
    }

    throw new Error(`BranchTerminatorOp#${this.id} has no target ${index}`);
  }
}
