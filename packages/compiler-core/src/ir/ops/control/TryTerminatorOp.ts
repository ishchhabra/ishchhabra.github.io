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
 * The try body, catch handler, and finally handler are executable CFG
 * successors. The exit block is a structural continuation reached by explicit
 * jumps from those regions.
 */
export class TryTerminatorOp extends TerminatorOp {
  constructor(
    id: OperationId,
    public readonly tryTarget: BlockTarget,
    public readonly catchTarget: BlockTarget | null,
    public readonly finallyTarget: BlockTarget | null,
    public readonly completionBlock: BasicBlock,
  ) {
    super(id);
  }

  public get tryBlock(): BasicBlock {
    return this.tryTarget.block;
  }

  public get finallyBlock(): BasicBlock | null {
    return this.finallyTarget?.block ?? null;
  }

  public override operands(): readonly Value[] {
    return [
      ...this.tryTarget.operands.forwarded,
      ...(this.catchTarget?.operands.forwarded ?? []),
      ...(this.finallyTarget?.operands.forwarded ?? []),
    ];
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override clone(context: OperationCloneContext): TryTerminatorOp {
    return new TryTerminatorOp(
      context.ids.operationId(),
      cloneBlockTarget(context, this.tryTarget),
      this.catchTarget === null ? null : cloneBlockTarget(context, this.catchTarget),
      this.finallyTarget === null ? null : cloneBlockTarget(context, this.finallyTarget),
      context.block(this.completionBlock),
    );
  }

  public override withOperands(operands: readonly Value[]): TryTerminatorOp {
    const tryCount = this.tryTarget.operands.forwarded.length;
    const catchCount = this.catchTarget?.operands.forwarded.length ?? 0;
    const finallyCount = this.finallyTarget?.operands.forwarded.length ?? 0;
    const expected = tryCount + catchCount + finallyCount;

    if (operands.length !== expected) {
      throw new Error(
        `TryTerminatorOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const tryTarget = replaceForwardedOperands(this.tryTarget, operands.slice(0, tryCount));
    const catchTarget =
      this.catchTarget === null
        ? null
        : replaceForwardedOperands(
            this.catchTarget,
            operands.slice(tryCount, tryCount + catchCount),
          );
    const finallyTarget =
      this.finallyTarget === null
        ? null
        : replaceForwardedOperands(this.finallyTarget, operands.slice(tryCount + catchCount));

    if (
      tryTarget === this.tryTarget &&
      catchTarget === this.catchTarget &&
      finallyTarget === this.finallyTarget
    ) {
      return this;
    }

    return new TryTerminatorOp(this.id, tryTarget, catchTarget, finallyTarget, this.completionBlock);
  }

  public override targetCount(): number {
    return 2 + (this.catchTarget === null ? 0 : 1) + (this.finallyTarget === null ? 0 : 1);
  }

  public override target(index: number): BlockTarget {
    if (index === 0) return this.tryTarget;

    let nextIndex = 1;

    if (this.catchTarget !== null) {
      if (index === nextIndex++) return this.catchTarget;
    }

    if (this.finallyTarget !== null) {
      if (index === nextIndex++) return this.finallyTarget;
    }

    if (index === nextIndex) return blockTarget(this.completionBlock);

    throw new Error(`TryTerminatorOp#${this.id} has no target ${index}`);
  }

  public override withTarget(index: number, target: BlockTarget): TryTerminatorOp {
    if (index === 0) {
      return new TryTerminatorOp(
        this.id,
        target,
        this.catchTarget,
        this.finallyTarget,
        this.completionBlock,
      );
    }

    let nextIndex = 1;

    if (this.catchTarget !== null) {
      if (index === nextIndex) {
        return new TryTerminatorOp(
          this.id,
          this.tryTarget,
          target,
          this.finallyTarget,
          this.completionBlock,
        );
      }
      nextIndex++;
    }

    if (this.finallyTarget !== null) {
      if (index === nextIndex) {
        return new TryTerminatorOp(
          this.id,
          this.tryTarget,
          this.catchTarget,
          target,
          this.completionBlock,
        );
      }
      nextIndex++;
    }

    if (index === nextIndex) {
      return new TryTerminatorOp(
        this.id,
        this.tryTarget,
        this.catchTarget,
        this.finallyTarget,
        target.block,
      );
    }

    throw new Error(`TryTerminatorOp#${this.id} has no target ${index}`);
  }

  public override successorIndices(): readonly number[] {
    return Array.from({ length: this.targetCount() - 1 }, (_, index) => index);
  }
}
