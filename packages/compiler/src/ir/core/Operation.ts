import { type OperationEffects, UnknownOperationEffects } from "../effects";
import type { BasicBlock } from "./Block";
import type { OperationCloneContext } from "./OperationCloneContext";
import type { Value } from "./Value";

declare const opaqueOperationId: unique symbol;

/**
 * Stable identity of an operation within an IR graph.
 *
 * Operation ids are for diagnostics, maps, and serialization. They are not
 * ordering keys; program order is defined by the owning block.
 */
export type OperationId = number & {
  readonly [opaqueOperationId]: "OperationId";
};

export function makeOperationId(id: number): OperationId {
  return id as OperationId;
}

/**
 * Base class for every executable IR node.
 *
 * An operation consumes zero or more operand values, may produce zero or more
 * result values, may have observable effects, and may be owned by a basic block.
 * Concrete subclasses define their operands and operation-specific semantics.
 */
export abstract class Operation {
  /**
   * Block that currently owns this operation.
   *
   * Null means the operation is detached or owned outside a block.
   */
  public ownerBlock: BasicBlock | null = null;

  constructor(
    public readonly id: OperationId,
    public readonly results: ReadonlyArray<Value> = [],
  ) {}

  /**
   * SSA values read by this operation.
   *
   * These are value dependencies only. Memory reads and writes are modeled by
   * `effects()`.
   */
  public abstract operands(): ReadonlyArray<Value>;

  /**
   * The only value defined by this operation.
   *
   * Use this for operations that are known to produce exactly one result.
   */
  public get result(): Value {
    if (this.results.length !== 1) {
      throw new Error(
        `${this.constructor.name}#${this.id} has ${this.results.length} results, expected 1`,
      );
    }

    return this.results[0];
  }

  /**
   * Observable behavior of this operation beyond its SSA results.
   */
  public effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  /**
   * Returns this operation with replacement operands.
   *
   * The replacement list must have the same arity and order as `operands()`.
   * Implementations may return `this` when the operands are unchanged.
   */
  public withOperands(operands: ReadonlyArray<Value>): Operation {
    const current = this.operands();

    if (operands.length !== current.length) {
      throw new Error(
        `${this.constructor.name}#${this.id} expected ${current.length} operands, got ${operands.length}`,
      );
    }

    for (let i = 0; i < operands.length; i++) {
      if (operands[i] !== current[i]) {
        throw new Error(`${this.constructor.name}#${this.id} does not support operand replacement`);
      }
    }

    return this;
  }

  /**
   * Clones this operation into another IR graph.
   *
   * Concrete operations that support graph cloning must allocate a fresh
   * operation id and remap operands, results, and successor blocks through the
   * clone context.
   */
  public clone(_context: OperationCloneContext): Operation {
    throw new Error(`${this.constructor.name}#${this.id} does not support cloning`);
  }

  /**
   * Verifies operation-local invariants.
   *
   * Function or module verification is responsible for graph-level invariants
   * such as dominance, reachability, and block ownership.
   */
  public verify(): void {
    for (const operand of this.operands()) {
      if (operand === null || operand === undefined) {
        throw new Error(`${this.constructor.name}#${this.id} has invalid operand`);
      }
    }

    for (const result of this.results) {
      if (result === null || result === undefined) {
        throw new Error(`${this.constructor.name}#${this.id} has invalid result`);
      }
    }
  }

  /**
   * Attaches this operation to a block and updates def-use links.
   *
   * Callers should normally reach this through block mutation APIs.
   */
  public attach(block: BasicBlock): void {
    if (this.ownerBlock !== null) {
      throw new Error(
        `${this.constructor.name}#${this.id} is already attached to bb${this.ownerBlock.id}`,
      );
    }

    this.ownerBlock = block;

    for (const operand of this.operands()) {
      operand._addUser(this);
    }

    for (const result of this.results) {
      result._setDefiner(this);
    }
  }

  /**
   * Detaches this operation from its block and updates def-use links.
   *
   * Callers should normally reach this through block mutation APIs.
   */
  public detach(): void {
    if (this.ownerBlock === null) {
      throw new Error(`${this.constructor.name}#${this.id} is not attached to any block`);
    }

    for (const operand of this.operands()) {
      operand._removeUser(this);
    }

    for (const result of this.results) {
      result._clearDefiner(this);
    }

    this.ownerBlock = null;
  }
}
