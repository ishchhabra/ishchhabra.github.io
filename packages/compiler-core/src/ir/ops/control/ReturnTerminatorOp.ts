import type { OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import { type BlockTarget, TerminatorOp } from "../../core/TerminatorOp";
import type { Value } from "../../core/Value";
import { type OperationEffects, PureOperationEffects } from "../../effects";

/**
 * Returns from the current function.
 */
export class ReturnTerminatorOp extends TerminatorOp {
  constructor(
    id: OperationId,
    public readonly value: Value | null = null,
  ) {
    super(id);
  }

  public override operands(): readonly Value[] {
    return this.value === null ? [] : [this.value];
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): ReturnTerminatorOp {
    const expected = this.value === null ? 0 : 1;
    if (operands.length !== expected) {
      throw new Error(
        `ReturnTerminatorOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    if (expected === 0) return this;

    const [value] = operands;
    if (value === this.value) return this;

    return new ReturnTerminatorOp(this.id, value);
  }

  public override clone(context: OperationCloneContext): ReturnTerminatorOp {
    return new ReturnTerminatorOp(
      context.ids.operationId(),
      this.value === null ? null : context.value(this.value),
    );
  }

  public override targetCount(): number {
    return 0;
  }

  public override target(index: number): BlockTarget {
    throw new Error(`ReturnTerminatorOp#${this.id} has no target ${index}`);
  }

  public override withTarget(index: number, _target: BlockTarget): TerminatorOp {
    throw new Error(`ReturnTerminatorOp#${this.id} has no target ${index}`);
  }
}
