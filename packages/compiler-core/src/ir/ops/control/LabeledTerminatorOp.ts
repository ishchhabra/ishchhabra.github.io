import type { BasicBlock } from "../../core/Block";
import type { OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import {
  blockTarget,
  type BlockTarget,
  cloneBlockTarget,
  replaceForwardedOperands,
  TerminatorOp,
} from "../../core/TerminatorOp";
import type { Value } from "../../core/Value";
import { type OperationEffects, PureOperationEffects } from "../../effects";

/**
 * Structured terminator for ECMAScript labeled statements.
 *
 * A label creates a named breakable region. `break label` targets `completionBlock`.
 * Labeled loops use loop terminator labels because `continue label` needs the
 * loop continuation target.
 */
export class LabeledTerminatorOp extends TerminatorOp {
  constructor(
    id: OperationId,
    public readonly label: string,
    public readonly bodyTarget: BlockTarget,
    public readonly completionBlock: BasicBlock,
  ) {
    super(id);
  }

  public get bodyBlock(): BasicBlock {
    return this.bodyTarget.block;
  }

  public override operands(): readonly Value[] {
    return this.bodyTarget.operands.forwarded;
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): LabeledTerminatorOp {
    const target = replaceForwardedOperands(this.bodyTarget, operands);
    if (target === this.bodyTarget) return this;

    return new LabeledTerminatorOp(this.id, this.label, target, this.completionBlock);
  }

  public override clone(context: OperationCloneContext): LabeledTerminatorOp {
    return new LabeledTerminatorOp(
      context.ids.operationId(),
      this.label,
      cloneBlockTarget(context, this.bodyTarget),
      context.block(this.completionBlock),
    );
  }

  public override targetCount(): number {
    return 2;
  }

  public override target(index: number): BlockTarget {
    if (index === 0) return this.bodyTarget;
    if (index === 1) return blockTarget(this.completionBlock);

    throw new Error(`LabeledTerminatorOp#${this.id} has no target ${index}`);
  }

  public override withTarget(index: number, target: BlockTarget): LabeledTerminatorOp {
    if (index === 0) {
      return new LabeledTerminatorOp(this.id, this.label, target, this.completionBlock);
    }

    if (index === 1) {
      return new LabeledTerminatorOp(this.id, this.label, this.bodyTarget, target.block);
    }

    throw new Error(`LabeledTerminatorOp#${this.id} has no target ${index}`);
  }

  public override successorIndices(): readonly number[] {
    return [0];
  }
}
