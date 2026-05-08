import { Value } from "../../core";
import type { IRIdAllocator } from "../../core/IRIdAllocator";
import { CopyValueOp } from "../../ops/values/CopyValueOp";

export interface ParallelCopy {
  readonly target: Value;
  readonly source: Value;
}

export interface ParallelCopySchedulerOptions {
  readonly ids: IRIdAllocator;
}

/**
 * Converts simultaneous copies into a sequential copy program.
 *
 * A copy is emitted only when writing its target cannot destroy a value still
 * needed by another pending copy. Cycles are broken with fresh temporary values.
 *
 * @example
 * ```txt
 * // Parallel:
 * a <- b
 * b <- a
 *
 * // Sequential:
 * t <- a
 * a <- b
 * b <- t
 * ```
 */
export function scheduleParallelCopies(
  copies: readonly ParallelCopy[],
  options: ParallelCopySchedulerOptions,
): CopyValueOp[] {
  const pending = normalizeCopies(copies);
  const scheduled: CopyValueOp[] = [];

  while (pending.length > 0) {
    const safeCopyIndex = pending.findIndex(
      (copy) => !pending.some((other) => other.source === copy.target),
    );

    if (safeCopyIndex !== -1) {
      const [copy] = pending.splice(safeCopyIndex, 1);
      scheduled.push(
        new CopyValueOp(options.ids.operationId(), copy.target, copy.source),
      );
      continue;
    }

    const preserved = pending[0].target;
    const temporary = new Value(options.ids.valueId());

    scheduled.push(
      new CopyValueOp(options.ids.operationId(), temporary, preserved),
    );

    for (let index = 0; index < pending.length; index++) {
      const copy = pending[index];

      if (copy.source === preserved) {
        pending[index] = { target: copy.target, source: temporary };
      }
    }
  }

  return scheduled;
}

function normalizeCopies(copies: readonly ParallelCopy[]): ParallelCopy[] {
  const targets: Set<Value> = new Set();
  const normalized: ParallelCopy[] = [];

  for (const copy of copies) {
    if (copy.target === copy.source) continue;

    if (targets.has(copy.target)) {
      throw new Error(
        `Parallel copy writes value#${copy.target.id} more than once`,
      );
    }

    targets.add(copy.target);
    normalized.push(copy);
  }

  return normalized;
}
