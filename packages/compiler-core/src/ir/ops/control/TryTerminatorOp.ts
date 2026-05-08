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
import { OperationEffects, PureOperationEffects } from "../../effects";

/**
 * Structured source-level terminator for ECMAScript `try` statements.
 *
 * The terminator owns the protected body, optional catch region, optional
 * finally region, and the statement exit. Compiler-2 keeps this structure
 * through JavaScript codegen so JS runtime semantics resume `break`,
 * `continue`, `return`, and `throw` through `finally`.
 *
 * Only the try body is an immediate CFG successor. The catch, finally, and exit
 * blocks are structural region targets used by lowering, verification, cloning,
 * and codegen.
 */
export class TryTerminatorOp extends TerminatorOp {
  constructor(
    id: OperationId,
    public readonly tryTarget: BlockTarget,
    public readonly catchTarget: BlockTarget | null,
    public readonly finallyBlock: BasicBlock | null,
    public readonly exitBlock: BasicBlock,
  ) {
    super(id);
  }

  public get tryBlock(): BasicBlock {
    return this.tryTarget.block;
  }

  public override operands(): readonly Value[] {
    return this.tryTarget.operands.forwarded;
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override clone(context: OperationCloneContext): TryTerminatorOp {
    return new TryTerminatorOp(
      context.ids.operationId(),
      cloneBlockTarget(context, this.tryTarget),
      this.catchTarget === null
        ? null
        : cloneBlockTarget(context, this.catchTarget),
      this.finallyBlock === null ? null : context.block(this.finallyBlock),
      context.block(this.exitBlock),
    );
  }

  public override withOperands(operands: readonly Value[]): TryTerminatorOp {
    const expected = this.tryTarget.operands.forwarded.length;

    if (operands.length !== expected) {
      throw new Error(
        `TryTerminatorOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const tryTarget = replaceForwardedOperands(this.tryTarget, operands);
    if (tryTarget === this.tryTarget) return this;

    return new TryTerminatorOp(
      this.id,
      tryTarget,
      this.catchTarget,
      this.finallyBlock,
      this.exitBlock,
    );
  }

  public override targetCount(): number {
    return (
      2 +
      (this.catchTarget === null ? 0 : 1) +
      (this.finallyBlock === null ? 0 : 1)
    );
  }

  public override target(index: number): BlockTarget {
    if (index === 0) return this.tryTarget;

    let nextIndex = 1;

    if (this.catchTarget !== null) {
      if (index === nextIndex++) return this.catchTarget;
    }

    if (this.finallyBlock !== null) {
      if (index === nextIndex++) return blockTarget(this.finallyBlock);
    }

    if (index === nextIndex) return blockTarget(this.exitBlock);

    throw new Error(`TryTerminatorOp#${this.id} has no target ${index}`);
  }

  public override withTarget(
    index: number,
    target: BlockTarget,
  ): TryTerminatorOp {
    if (index === 0) {
      return new TryTerminatorOp(
        this.id,
        target,
        this.catchTarget,
        this.finallyBlock,
        this.exitBlock,
      );
    }

    let nextIndex = 1;

    if (this.catchTarget !== null) {
      if (index === nextIndex) {
        return new TryTerminatorOp(
          this.id,
          this.tryTarget,
          target,
          this.finallyBlock,
          this.exitBlock,
        );
      }
      nextIndex++;
    }

    if (this.finallyBlock !== null) {
      if (index === nextIndex) {
        return new TryTerminatorOp(
          this.id,
          this.tryTarget,
          this.catchTarget,
          target.block,
          this.exitBlock,
        );
      }
      nextIndex++;
    }

    if (index === nextIndex) {
      return new TryTerminatorOp(
        this.id,
        this.tryTarget,
        this.catchTarget,
        this.finallyBlock,
        target.block,
      );
    }

    throw new Error(`TryTerminatorOp#${this.id} has no target ${index}`);
  }

  public override successorIndices(): readonly number[] {
    return [0];
  }
}
