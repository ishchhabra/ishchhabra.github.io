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
 * Structured value terminator for ECMAScript conditional value control flow.
 *
 * The `test` value is evaluated before this terminator. Depending on ECMAScript
 * truthiness, control enters either `consequentTarget` or `alternateTarget`.
 * Each arm evaluates only when selected, then forwards the produced expression
 * result to the shared `completionBlock`.
 *
 * @example
 * ```js
 * const value = test ? consequent : alternate;
 * ```
 */
export class ConditionalTerminatorOp extends TerminatorOp {
  constructor(
    id: OperationId,
    public readonly test: Value,
    public readonly consequentTarget: BlockTarget,
    public readonly alternateTarget: BlockTarget,
    public readonly completionBlock: BasicBlock,
  ) {
    super(id);
  }

  public get consequentBlock(): BasicBlock {
    return this.consequentTarget.block;
  }

  public get alternateBlock(): BasicBlock {
    return this.alternateTarget.block;
  }

  public override operands(): readonly Value[] {
    return [
      this.test,
      ...successorValues(this.consequentTarget),
      ...successorValues(this.alternateTarget),
    ];
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): ConditionalTerminatorOp {
    const consequentValues = successorValues(this.consequentTarget);
    const alternateValues = successorValues(this.alternateTarget);
    const expected = 1 + consequentValues.length + alternateValues.length;

    if (operands.length !== expected) {
      throw new Error(
        `ConditionalTerminatorOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const [test, ...successorOperands] = operands;
    const consequentTarget = replaceSuccessorValues(
      this.consequentTarget,
      successorOperands.slice(0, consequentValues.length),
    );
    const alternateTarget = replaceSuccessorValues(
      this.alternateTarget,
      successorOperands.slice(consequentValues.length),
    );

    if (
      test === this.test &&
      consequentTarget === this.consequentTarget &&
      alternateTarget === this.alternateTarget
    ) {
      return this;
    }

    return new ConditionalTerminatorOp(
      this.id,
      test,
      consequentTarget,
      alternateTarget,
      this.completionBlock,
    );
  }

  public override clone(context: OperationCloneContext): ConditionalTerminatorOp {
    return new ConditionalTerminatorOp(
      context.ids.operationId(),
      context.value(this.test),
      cloneBlockTarget(context, this.consequentTarget),
      cloneBlockTarget(context, this.alternateTarget),
      context.block(this.completionBlock),
    );
  }

  public override targetCount(): number {
    return 3;
  }

  public override target(index: number): BlockTarget {
    if (index === 0) return this.consequentTarget;
    if (index === 1) return this.alternateTarget;
    if (index === 2) {
      return {
        block: this.completionBlock,
        operands: { produced: [], forwarded: [] },
      };
    }

    throw new Error(`ConditionalTerminatorOp#${this.id} has no target ${index}`);
  }

  public override withTarget(index: number, target: BlockTarget): ConditionalTerminatorOp {
    if (index === 0) {
      return new ConditionalTerminatorOp(
        this.id,
        this.test,
        target,
        this.alternateTarget,
        this.completionBlock,
      );
    }

    if (index === 1) {
      return new ConditionalTerminatorOp(
        this.id,
        this.test,
        this.consequentTarget,
        target,
        this.completionBlock,
      );
    }

    if (index === 2) {
      return new ConditionalTerminatorOp(
        this.id,
        this.test,
        this.consequentTarget,
        this.alternateTarget,
        target.block,
      );
    }

    throw new Error(`ConditionalTerminatorOp#${this.id} has no target ${index}`);
  }

  public override successorIndices(): readonly number[] {
    return [0, 1];
  }
}
