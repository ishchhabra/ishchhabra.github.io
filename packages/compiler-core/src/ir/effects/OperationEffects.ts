import { UnknownMemoryLocation, type MemoryLocation } from "./MemoryLocation";

/**
 * Memory regions read or written by an operation.
 */
export interface MemoryEffects {
  readonly reads: readonly MemoryLocation[];
  readonly writes: readonly MemoryLocation[];
}

/**
 * Observable behavior of an operation beyond its SSA result values.
 *
 * This is the summary consumed by optimization, scheduling, dead-code
 * elimination, and verification passes.
 */
export interface OperationEffects {
  readonly memory: MemoryEffects;
  readonly mayThrow: boolean;
  readonly mayDiverge: boolean;
  readonly isObservable: boolean;
}

/**
 * Conservative effect summary for an operation whose behavior is not modeled.
 */
export const UnknownOperationEffects: OperationEffects = {
  memory: {
    reads: [UnknownMemoryLocation],
    writes: [UnknownMemoryLocation],
  },
  mayThrow: true,
  mayDiverge: true,
  isObservable: true,
};

/**
 * Effect summary for a pure operation that always terminates normally.
 */
export const PureOperationEffects: OperationEffects = {
  memory: {
    reads: [],
    writes: [],
  },
  mayThrow: false,
  mayDiverge: false,
  isObservable: false,
};

/**
 * Creates an effect summary for an operation that only reads memory.
 */
export function readEffects(reads: readonly MemoryLocation[]): OperationEffects {
  return {
    memory: {
      reads,
      writes: [],
    },
    mayThrow: false,
    mayDiverge: false,
    isObservable: false,
  };
}

/**
 * Creates an effect summary for an operation that may write memory.
 *
 * Writes are observable to later operations even when the operation has no SSA
 * users, so write effects are marked observable by default.
 */
export function writeEffects(
  writes: readonly MemoryLocation[],
  reads: readonly MemoryLocation[] = [],
): OperationEffects {
  return {
    memory: {
      reads,
      writes,
    },
    mayThrow: false,
    mayDiverge: false,
    isObservable: true,
  };
}

/**
 * Returns whether an operation with these effects can be replaced or removed
 * when its result values are no longer needed.
 */
export function canDropOperationEffects(effects: OperationEffects): boolean {
  return (
    effects.memory.reads.length === 0 &&
    effects.memory.writes.length === 0 &&
    !effects.mayThrow &&
    !effects.mayDiverge &&
    !effects.isObservable
  );
}
