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
 * Structured terminator for `if` statements.
 *
 * `thenTarget` and `elseTarget` are immediate CFG successors selected by
 * the condition. `completionBlock` is the block after the structured `if` region.
 *
 * @example
 * ```js
 * if (condition) {
 *   thenBody();
 * } else {
 *   elseBody();
 * }
 * after();
 * ```
 */
export class IfTerminatorOp extends TerminatorOp {
  constructor(
    id: OperationId,
    public readonly condition: Value,
    public readonly thenTarget: BlockTarget,
    public readonly elseTarget: BlockTarget,
    public readonly completionBlock: BasicBlock,
  ) {
    super(id);
  }

  public get thenBlock(): BasicBlock {
    return this.thenTarget.block;
  }

  public get elseBlock(): BasicBlock {
    return this.elseTarget.block;
  }

  public override operands(): readonly Value[] {
    return [
      this.condition,
      ...successorValues(this.thenTarget),
      ...successorValues(this.elseTarget),
    ];
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): IfTerminatorOp {
    const thenValues = successorValues(this.thenTarget);
    const elseValues = successorValues(this.elseTarget);
    const expected = 1 + thenValues.length + elseValues.length;

    if (operands.length !== expected) {
      throw new Error(
        `IfTerminatorOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const [condition, ...successorOperands] = operands;
    const thenTarget = replaceSuccessorValues(
      this.thenTarget,
      successorOperands.slice(0, thenValues.length),
    );
    const elseTarget = replaceSuccessorValues(
      this.elseTarget,
      successorOperands.slice(thenValues.length),
    );

    if (
      condition === this.condition &&
      thenTarget === this.thenTarget &&
      elseTarget === this.elseTarget
    ) {
      return this;
    }

    return new IfTerminatorOp(this.id, condition, thenTarget, elseTarget, this.completionBlock);
  }

  public override clone(context: OperationCloneContext): IfTerminatorOp {
    return new IfTerminatorOp(
      context.ids.operationId(),
      context.value(this.condition),
      cloneBlockTarget(context, this.thenTarget),
      cloneBlockTarget(context, this.elseTarget),
      context.block(this.completionBlock),
    );
  }

  public override targetCount(): number {
    return 2;
  }

  public override target(index: number): BlockTarget {
    if (index === 0) return this.thenTarget;
    if (index === 1) return this.elseTarget;

    throw new Error(`IfTerminatorOp#${this.id} has no target ${index}`);
  }

  public override withTarget(index: number, target: BlockTarget): IfTerminatorOp {
    if (index === 0) {
      return new IfTerminatorOp(
        this.id,
        this.condition,
        target,
        this.elseTarget,
        this.completionBlock,
      );
    }

    if (index === 1) {
      return new IfTerminatorOp(
        this.id,
        this.condition,
        this.thenTarget,
        target,
        this.completionBlock,
      );
    }

    throw new Error(`IfTerminatorOp#${this.id} has no target ${index}`);
  }
}
