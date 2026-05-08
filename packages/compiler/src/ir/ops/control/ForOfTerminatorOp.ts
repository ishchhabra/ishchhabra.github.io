import { BasicBlock } from "../../core/Block";
import { OperationId } from "../../core/Operation";
import { OperationCloneContext } from "../../core/OperationCloneContext";
import {
  blockTarget,
  BlockTarget,
  cloneBlockTarget,
  replaceForwardedOperands,
  TerminatorOp,
} from "../../core/TerminatorOp";
import { Value } from "../../core/Value";
import { OperationEffects, UnknownOperationEffects } from "../../effects";

/**
 * Structured terminator for ECMAScript `for...of` loops.
 *
 * The terminator owns iterator advancement and branches either to the body with
 * the produced iteration value or to the exit block when iteration completes.
 */
export class ForOfTerminatorOp extends TerminatorOp {
  constructor(
    id: OperationId,
    public readonly iterable: Value,
    public readonly bodyTarget: BlockTarget,
    public readonly exitTarget: BlockTarget,
    public readonly isAwait: boolean = false,
    public readonly label: string | null = null,
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
    return [
      this.iterable,
      ...this.bodyTarget.operands.forwarded,
      ...this.exitTarget.operands.forwarded,
    ];
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): ForOfTerminatorOp {
    const bodyCount = this.bodyTarget.operands.forwarded.length;
    const exitCount = this.exitTarget.operands.forwarded.length;
    const expected = 1 + bodyCount + exitCount;

    if (operands.length !== expected) {
      throw new Error(
        `ForOfTerminatorOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const [iterable, ...successorOperands] = operands;
    const bodyTarget = replaceForwardedOperands(
      this.bodyTarget,
      successorOperands.slice(0, bodyCount),
    );
    const exitTarget = replaceForwardedOperands(
      this.exitTarget,
      successorOperands.slice(bodyCount),
    );
    if (
      iterable === this.iterable &&
      bodyTarget === this.bodyTarget &&
      exitTarget === this.exitTarget
    ) {
      return this;
    }

    return new ForOfTerminatorOp(
      this.id,
      iterable,
      bodyTarget,
      exitTarget,
      this.isAwait,
      this.label,
    );
  }

  public override clone(context: OperationCloneContext): ForOfTerminatorOp {
    return new ForOfTerminatorOp(
      context.ids.operationId(),
      context.value(this.iterable),
      cloneBlockTarget(context, this.bodyTarget),
      cloneBlockTarget(context, this.exitTarget),
      this.isAwait,
      this.label,
    );
  }

  public override targetCount(): number {
    return 2;
  }

  public override target(index: number): BlockTarget {
    if (index === 0) return this.bodyTarget;
    if (index === 1) return this.exitTarget;

    throw new Error(`ForOfTerminatorOp#${this.id} has no target ${index}`);
  }

  public override withTarget(
    index: number,
    target: BlockTarget,
  ): ForOfTerminatorOp {
    if (index === 0) {
      return new ForOfTerminatorOp(
        this.id,
        this.iterable,
        target,
        this.exitTarget,
        this.isAwait,
        this.label,
      );
    }

    if (index === 1) {
      return new ForOfTerminatorOp(
        this.id,
        this.iterable,
        this.bodyTarget,
        target,
        this.isAwait,
        this.label,
      );
    }

    throw new Error(`ForOfTerminatorOp#${this.id} has no target ${index}`);
  }
}
