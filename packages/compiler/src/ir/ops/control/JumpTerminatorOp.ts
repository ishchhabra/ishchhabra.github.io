import { BasicBlock } from "../../core/Block";
import { OperationId } from "../../core/Operation";
import { OperationCloneContext } from "../../core/OperationCloneContext";
import {
  BlockTarget,
  replaceSuccessorValues,
  successorValues,
  TerminatorOp,
} from "../../core/TerminatorOp";
import { Value } from "../../core/Value";
import { OperationEffects, PureOperationEffects } from "../../effects";

/**
 * Transfers control unconditionally to another block.
 *
 * Jump operands are forwarded to the target block parameters in order.
 */
export class JumpTerminatorOp extends TerminatorOp {
  constructor(
    id: OperationId,
    public readonly jumpTarget: BlockTarget,
  ) {
    super(id);
  }

  public get targetBlock(): BasicBlock {
    return this.jumpTarget.block;
  }

  public get args(): readonly Value[] {
    return successorValues(this.jumpTarget);
  }

  public override operands(): readonly Value[] {
    return this.args;
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): JumpTerminatorOp {
    return new JumpTerminatorOp(
      this.id,
      replaceSuccessorValues(this.jumpTarget, operands),
    );
  }

  public override clone(context: OperationCloneContext): JumpTerminatorOp {
    return new JumpTerminatorOp(context.ids.operationId(), {
      block: context.block(this.jumpTarget.block),
      operands: {
        produced: this.jumpTarget.operands.produced.map((value) =>
          context.value(value),
        ),
        forwarded: this.jumpTarget.operands.forwarded.map((value) =>
          context.value(value),
        ),
      },
    });
  }

  public override targetCount(): number {
    return 1;
  }

  public override target(index: number): BlockTarget {
    if (index !== 0) {
      throw new Error(`JumpTerminatorOp#${this.id} has no target ${index}`);
    }

    return this.jumpTarget;
  }

  public override withTarget(
    index: number,
    target: BlockTarget,
  ): JumpTerminatorOp {
    if (index !== 0) {
      throw new Error(`JumpTerminatorOp#${this.id} has no target ${index}`);
    }

    return new JumpTerminatorOp(this.id, target);
  }
}
