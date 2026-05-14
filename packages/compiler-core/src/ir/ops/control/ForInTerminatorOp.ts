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
import { type OperationEffects, UnknownOperationEffects } from "../../effects";

/**
 * Structured terminator for ECMAScript `for...in` loops.
 *
 * The terminator owns enumerable-property iteration and branches either to the
 * body with the produced property key or to the exit block when enumeration
 * completes.
 */
export class ForInTerminatorOp extends TerminatorOp {
  constructor(
    id: OperationId,
    public readonly object: Value,
    public readonly bodyTarget: BlockTarget,
    public readonly exitTarget: BlockTarget,
    public readonly completionBlock: BasicBlock,
    public readonly label: string | null = null,
  ) {
    super(id);
  }

  public get bodyBlock(): BasicBlock {
    return this.bodyTarget.block;
  }

  public override operands(): readonly Value[] {
    return [
      this.object,
      ...this.bodyTarget.operands.forwarded,
      ...this.exitTarget.operands.forwarded,
    ];
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): ForInTerminatorOp {
    const bodyCount = this.bodyTarget.operands.forwarded.length;
    const exitCount = this.exitTarget.operands.forwarded.length;
    const expected = 1 + bodyCount + exitCount;

    if (operands.length !== expected) {
      throw new Error(
        `ForInTerminatorOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const [object, ...successorOperands] = operands;
    const bodyTarget = replaceForwardedOperands(
      this.bodyTarget,
      successorOperands.slice(0, bodyCount),
    );
    const exitTarget = replaceForwardedOperands(
      this.exitTarget,
      successorOperands.slice(bodyCount),
    );
    if (object === this.object && bodyTarget === this.bodyTarget && exitTarget === this.exitTarget)
      return this;

    return new ForInTerminatorOp(
      this.id,
      object,
      bodyTarget,
      exitTarget,
      this.completionBlock,
      this.label,
    );
  }

  public override clone(context: OperationCloneContext): ForInTerminatorOp {
    return new ForInTerminatorOp(
      context.ids.operationId(),
      context.value(this.object),
      cloneBlockTarget(context, this.bodyTarget),
      cloneBlockTarget(context, this.exitTarget),
      context.block(this.completionBlock),
      this.label,
    );
  }

  public override targetCount(): number {
    return 2;
  }

  public override target(index: number): BlockTarget {
    if (index === 0) return this.bodyTarget;
    if (index === 1) return this.exitTarget;

    throw new Error(`ForInTerminatorOp#${this.id} has no target ${index}`);
  }

  public override withTarget(index: number, target: BlockTarget): ForInTerminatorOp {
    if (index === 0) {
      return new ForInTerminatorOp(
        this.id,
        this.object,
        target,
        this.exitTarget,
        this.completionBlock,
        this.label,
      );
    }

    if (index === 1) {
      return new ForInTerminatorOp(
        this.id,
        this.object,
        this.bodyTarget,
        target,
        this.completionBlock,
        this.label,
      );
    }

    throw new Error(`ForInTerminatorOp#${this.id} has no target ${index}`);
  }
}
