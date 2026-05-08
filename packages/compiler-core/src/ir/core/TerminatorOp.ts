import { BasicBlock } from "./Block";
import { Operation } from "./Operation";
import type { OperationCloneContext } from "./OperationCloneContext";
import { Value } from "./Value";

/**
 * Operands passed from a terminator to a successor block.
 *
 * Produced operands are values supplied by the terminator's own semantics, such
 * as a `for-of` iteration value or a caught exception. Forwarded operands are
 * existing SSA values passed from the predecessor block.
 *
 * The concatenation of `produced` and `forwarded` is bound positionally to the
 * successor block's parameters.
 */
export interface SuccessorOperands {
  readonly produced: ReadonlyArray<Value>;
  readonly forwarded: ReadonlyArray<Value>;
}

/**
 * Successor edge from a terminator to a basic block.
 */
export interface BlockTarget {
  readonly block: BasicBlock;
  readonly operands: SuccessorOperands;
}

/**
 * Creates successor operands from existing SSA values.
 */
export function forwardedOperands(
  values: readonly Value[] = [],
): SuccessorOperands {
  return {
    produced: [],
    forwarded: values,
  };
}

/**
 * Creates successor operands supplied by the terminator itself.
 */
export function producedOperands(values: readonly Value[]): SuccessorOperands {
  return {
    produced: values,
    forwarded: [],
  };
}

/**
 * Creates a successor target that forwards existing SSA values.
 */
export function blockTarget(
  block: BasicBlock,
  values: readonly Value[] = [],
): BlockTarget {
  return {
    block,
    operands: forwardedOperands(values),
  };
}

/**
 * Values bound to the successor block parameters, in positional order.
 */
export function successorValues(target: BlockTarget): readonly Value[] {
  return [...target.operands.produced, ...target.operands.forwarded];
}

/**
 * Returns a successor target with the same block and replacement operands.
 *
 * `values` uses the same positional layout as `successorValues`: procuded
 * operands first, followed by forwarded operands.
 */
export function replaceSuccessorValues(
  target: BlockTarget,
  values: readonly Value[],
): BlockTarget {
  const producedCount = target.operands.produced.length;
  const forwardedCount = target.operands.forwarded.length;
  const expected = producedCount + forwardedCount;

  if (values.length !== expected) {
    throw new Error(
      `Expected ${expected} successor values, got ${values.length}`,
    );
  }

  const produced = values.slice(0, producedCount);
  const forwarded = values.slice(producedCount);

  if (
    sameValueList(produced, target.operands.produced) &&
    sameValueList(forwarded, target.operands.forwarded)
  ) {
    return target;
  }

  return { block: target.block, operands: { produced, forwarded } };
}

/**
 * Returns a successor target with replacement forwarded operands.
 *
 * Produced operands are supplied by the terminator itself and are preserved.
 */
export function replaceForwardedOperands(
  target: BlockTarget,
  forwarded: readonly Value[],
): BlockTarget {
  if (sameValueList(forwarded, target.operands.forwarded)) {
    return target;
  }

  return {
    block: target.block,
    operands: {
      produced: target.operands.produced,
      forwarded,
    },
  };
}

/**
 * Returns whether two value lists contain the same value objects in order.
 */
export function sameValueList(
  left: readonly Value[],
  right: readonly Value[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

/**
 * Clones a successor edge through an operation clone context.
 */
export function cloneBlockTarget(
  context: OperationCloneContext,
  target: BlockTarget,
): BlockTarget {
  return {
    block: context.block(target.block),
    operands: {
      produced: target.operands.produced.map((value) => context.value(value)),
      forwarded: target.operands.forwarded.map((value) => context.value(value)),
    },
  };
}

/**
 * Operation that terminates a basic block.
 *
 * A terminator is the last operation in a block and defines the block's
 * outgoing control-flow edges. Terminators may read ordinary operands and may
 * also produce successor operands that are bound to successor block parameters.
 */
export abstract class TerminatorOp extends Operation {
  /**
   * Number of successor edge slots owned by this terminator.
   */
  abstract targetCount(): number;

  /**
   * Successor target at a stable edge index.
   */
  abstract target(index: number): BlockTarget;

  /**
   * Returns a copy of this terminator with one successor target replaced.
   */
  abstract withTarget(index: number, target: BlockTarget): TerminatorOp;

  /** Target indices that are executable CFG successors.
   *
   * Structured terminators may own target slots that are not immediate runtime
   * successors, such as loop body, test, or exit blocks. Analyses that walk
   * runtime control flow should use this method. Structural operations such as
   * cloning, remapping, verification, and use-list maintenance should use
   * `targetCount`, `target`, or `targets`.
   */
  public successorIndices(): readonly number[] {
    return Array.from({ length: this.targetCount() }, (_, index) => index);
  }

  /**
   * Successor edges in stable edge-index order.
   */
  targets(): readonly BlockTarget[] {
    return Array.from({ length: this.targetCount() }, (_, index) =>
      this.target(index),
    );
  }

  /**
   * Attaches this terminator and registers successor block uses.
   */
  override attach(block: BasicBlock): void {
    super.attach(block);

    for (const target of this.targets()) {
      target.block._addUse(this);
    }
  }

  /**
   * Detaches this terminator and unregisters successor block uses.
   */
  override detach(): void {
    for (const target of this.targets()) {
      target.block._removeUse(this);
    }

    super.detach();
  }
}
