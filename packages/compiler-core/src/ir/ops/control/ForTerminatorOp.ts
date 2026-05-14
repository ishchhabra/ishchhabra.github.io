import { BasicBlock } from "../../core/Block";
import { OperationId } from "../../core/Operation";
import { OperationCloneContext } from "../../core/OperationCloneContext";
import {
  BlockTarget,
  blockTarget,
  cloneBlockTarget,
  replaceForwardedOperands,
  TerminatorOp,
} from "../../core/TerminatorOp";
import { Value } from "../../core/Value";
import { OperationEffects, PureOperationEffects } from "../../effects";

/**
 * Structured terminator for `for` statements.
 *
 * The initializer executes before this terminator. The host block then enters
 * the test block. The test branches to the body or exit. A normally completing
 * body jumps to the update block, and the update block jumps back to the host.
 */
export class ForTerminatorOp extends TerminatorOp {
  constructor(
    id: OperationId,
    public readonly testTarget: BlockTarget,
    public readonly bodyBlock: BasicBlock,
    public readonly updateBlock: BasicBlock,
    public readonly completionBlock: BasicBlock,
    public readonly label: string | null = null,
  ) {
    super(id);
  }

  public get testBlock(): BasicBlock {
    return this.testTarget.block;
  }

  public override operands(): readonly Value[] {
    return this.testTarget.operands.forwarded;
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): ForTerminatorOp {
    const expected = this.testTarget.operands.forwarded.length;

    if (operands.length !== expected) {
      throw new Error(
        `ForTerminatorOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const testTarget = replaceForwardedOperands(this.testTarget, operands);
    if (testTarget === this.testTarget) return this;

    return new ForTerminatorOp(
      this.id,
      testTarget,
      this.bodyBlock,
      this.updateBlock,
      this.completionBlock,
      this.label,
    );
  }

  public override clone(context: OperationCloneContext): ForTerminatorOp {
    return new ForTerminatorOp(
      context.ids.operationId(),
      cloneBlockTarget(context, this.testTarget),
      context.block(this.bodyBlock),
      context.block(this.updateBlock),
      context.block(this.completionBlock),
      this.label,
    );
  }

  public override targetCount(): number {
    return 4;
  }

  public override target(index: number): BlockTarget {
    if (index === 0) return this.testTarget;
    if (index === 1) return blockTarget(this.bodyBlock);
    if (index === 2) return blockTarget(this.updateBlock);
    if (index === 3) return blockTarget(this.completionBlock);

    throw new Error(`ForTerminatorOp#${this.id} has no target ${index}`);
  }

  public override withTarget(index: number, target: BlockTarget): ForTerminatorOp {
    if (index === 0) {
      return new ForTerminatorOp(
        this.id,
        target,
        this.bodyBlock,
        this.updateBlock,
        this.completionBlock,
        this.label,
      );
    }

    if (index === 1) {
      return new ForTerminatorOp(
        this.id,
        this.testTarget,
        target.block,
        this.updateBlock,
        this.completionBlock,
        this.label,
      );
    }

    if (index === 2) {
      return new ForTerminatorOp(
        this.id,
        this.testTarget,
        this.bodyBlock,
        target.block,
        this.completionBlock,
        this.label,
      );
    }

    if (index === 3) {
      return new ForTerminatorOp(
        this.id,
        this.testTarget,
        this.bodyBlock,
        this.updateBlock,
        target.block,
        this.label,
      );
    }

    throw new Error(`ForTerminatorOp#${this.id} has no target ${index}`);
  }

  public override successorIndices(): readonly number[] {
    return [0];
  }
}
