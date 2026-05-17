import type { BasicBlock } from "../../core/Block";
import type { OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import {
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
 * A label creates a named breakable region. `break label` targets `exitBlock`.
 * Labeled loops use loop terminator labels because `continue label` needs the
 * loop continuation target.
 */
export class LabeledTerminatorOp extends TerminatorOp {
  constructor(
    id: OperationId,
    public readonly label: string,
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
    return [...this.bodyTarget.operands.forwarded, ...this.exitTarget.operands.forwarded];
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): LabeledTerminatorOp {
    const bodyCount = this.bodyTarget.operands.forwarded.length;
    const expected = bodyCount + this.exitTarget.operands.forwarded.length;

    if (operands.length !== expected) {
      throw new Error(
        `LabeledTerminatorOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const bodyTarget = replaceForwardedOperands(this.bodyTarget, operands.slice(0, bodyCount));
    const exitTarget = replaceForwardedOperands(this.exitTarget, operands.slice(bodyCount));

    if (bodyTarget === this.bodyTarget && exitTarget === this.exitTarget) return this;

    return new LabeledTerminatorOp(this.id, this.label, bodyTarget, exitTarget);
  }

  public override clone(context: OperationCloneContext): LabeledTerminatorOp {
    return new LabeledTerminatorOp(
      context.ids.operationId(),
      this.label,
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

    throw new Error(`LabeledTerminatorOp#${this.id} has no target ${index}`);
  }

  public override withTarget(index: number, target: BlockTarget): LabeledTerminatorOp {
    if (index === 0) {
      return new LabeledTerminatorOp(this.id, this.label, target, this.exitTarget);
    }

    if (index === 1) {
      return new LabeledTerminatorOp(this.id, this.label, this.bodyTarget, target);
    }

    throw new Error(`LabeledTerminatorOp#${this.id} has no target ${index}`);
  }

  public override successorIndices(): readonly number[] {
    return [0];
  }
}
