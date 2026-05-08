import { FunctionIR } from "./FunctionIR";
import { Operation } from "./Operation";
import { TerminatorOp } from "./TerminatorOp";
import { Value } from "./Value";

declare const opaqueBlockId: unique symbol;

/**
 * Stable identity of a basic block within an IR graph.
 *
 * Block ids are for diagnostics, maps, and serialization. They are not
 * ordering keys; block order is defined by the owning function or region.
 */
export type BlockId = number & {
  readonly [opaqueBlockId]: "BlockId";
};

export function makeBlockId(id: number): BlockId {
  return id as BlockId;
}

/**
 * Basic block in a function control-flow graph.
 *
 * A block is a linear sequence of operations with one control-flow exit.
 * Non-terminator operations execute in order. The optional terminator
 * describes how control leaves the block.
 *
 * Block parameters model SSA values supplied by predecessor edges. They are
 * the block-argument form of phi nodes.
 */
export class BasicBlock {
  readonly #operations: Operation[] = [];
  readonly #params: Value[] = [];
  readonly #uses = new Set<TerminatorOp>();

  /**
   * Function that currently owns this block.
   *
   * Null means the block is detached or still being assembled.
   */
  public ownerFunction: FunctionIR | null = null;

  constructor(public readonly id: BlockId) {}

  /**
   * Operations in program order.
   */
  public get operations(): readonly Operation[] {
    return this.#operations;
  }

  /**
   * Values bound when control enters this block.
   */
  public get params(): readonly Value[] {
    return this.#params;
  }

  /**
   * Terminator operation, if the block has one.
   */
  public get terminator(): TerminatorOp | null {
    const last = this.#operations[this.#operations.length - 1];
    return last instanceof TerminatorOp ? last : null;
  }

  /**
   * Whether this block has a terminator.
   */
  public get isTerminated(): boolean {
    return this.terminator !== null;
  }

  /**
   * Appends a block parameter.
   */
  public appendParam(param: Value): void {
    this.#params.push(param);
  }

  /**
   * Replaces this block's parameters.
   *
   * Use intent-specific APIs such as `appendParam`, `removeParam`, and
   * `clearParams` when updating an existing CFG.
   */
  public setParams(params: readonly Value[]): void {
    this.#params.length = 0;
    this.#params.push(...params);
  }

  /**
   * Removes one block parameter by index.
   */
  public removeParam(index: number): Value {
    if (index < 0 || index >= this.#params.length) {
      throw new Error(`Block bb${this.id} has no parameter at index ${index}`);
    }

    const [removed] = this.#params.splice(index, 1);
    return removed;
  }

  /**
   * Removes all block parameters.
   */
  public clearParams(): void {
    this.#params.length = 0;
  }

  /**
   * Appends a non-terminator operation.
   */
  public appendOp(op: Operation): void {
    if (op instanceof TerminatorOp) {
      throw new Error(`Use setTerminator to attach ${op.constructor.name}#${op.id}`);
    }

    if (this.isTerminated) {
      throw new Error(`Cannot append operation after terminator in bb${this.id}`);
    }

    op.attach(this);
    this.#operations.push(op);
  }

  /**
   * Inserts a non-terminator operation at a program-order index.
   */
  public insertOp(index: number, op: Operation): void {
    if (op instanceof TerminatorOp) {
      throw new Error(`Use setTerminator to attach ${op.constructor.name}#${op.id}`);
    }

    const maxIndex = this.isTerminated ? this.#operations.length - 1 : this.#operations.length;
    if (index < 0 || index > maxIndex) {
      throw new Error(`Cannot insert operation at index ${index}; expected 0..${maxIndex}`);
    }

    op.attach(this);
    this.#operations.splice(index, 0, op);
  }

  /**
   * Installs this block's terminator as the final operation.
   */
  public setTerminator(terminator: TerminatorOp): void {
    if (this.isTerminated) {
      throw new Error(`Block bb${this.id} already has a terminator`);
    }

    terminator.attach(this);
    this.#operations.push(terminator);
  }

  /**
   * Replaces an operation owned by this block.
   *
   * The replacement must preserve whether the operation is a terminator.
   */
  public replaceOp(oldOp: Operation, newOp: Operation): void {
    if (oldOp === newOp) return;

    const index = this.#operations.indexOf(oldOp);
    if (index === -1) {
      throw new Error(`${oldOp.constructor.name}#${oldOp.id} is not owned by bb${this.id}`);
    }

    const oldIsTerminator = oldOp instanceof TerminatorOp;
    const newIsTerminator = newOp instanceof TerminatorOp;

    if (oldIsTerminator !== newIsTerminator) {
      throw new Error("Cannot replace a terminator with a non-terminator or vice versa");
    }

    if (newIsTerminator && index !== this.#operations.length - 1) {
      throw new Error("Terminator must be the final operation in a block");
    }

    oldOp.detach();
    newOp.attach(this);
    this.#operations[index] = newOp;
  }

  /**
   * Removes an operation owned by this block.
   */
  public removeOp(op: Operation): Operation {
    const index = this.#operations.indexOf(op);
    if (index === -1) {
      throw new Error(`${op.constructor.name}#${op.id} is not owned by bb${this.id}`);
    }

    this.#operations.splice(index, 1);
    op.detach();
    return op;
  }

  /**
   * Detaches all operations and clears block parameters.
   */
  public clear(): void {
    for (const op of [...this.#operations].reverse()) {
      this.removeOp(op);
    }

    this.clearParams();
  }

  /**
   * Terminators whose successor lists reference this block.
   */
  public get uses(): ReadonlySet<TerminatorOp> {
    return this.#uses;
  }

  /**
   * Blocks that can transfer control to this block through explicit successor
   * edges.
   */
  public predecessors(): Set<BasicBlock> {
    const predecessors = new Set<BasicBlock>();

    for (const user of this.#uses) {
      const owner = user.ownerBlock;
      if (owner === null) continue;

      for (const index of user.successorIndices()) {
        if (user.target(index).block === this) {
          predecessors.add(owner);
          break;
        }
      }
    }

    return predecessors;
  }

  /**
   * Registers a terminator that references this block.
   *
   * @internal
   */
  public _addUse(user: TerminatorOp): void {
    if (this.#uses.has(user)) {
      throw new Error(
        `Block bb${this.id} already has a use of ${user.constructor.name}#${user.id}`,
      );
    }

    this.#uses.add(user);
  }

  /**
   * Removes a terminator from this block's use-list.
   *
   * @internal
   */
  public _removeUse(user: TerminatorOp): void {
    if (!this.#uses.has(user)) {
      throw new Error(
        `Block bb${this.id} does not have a use of ${user.constructor.name}#${user.id}`,
      );
    }

    this.#uses.delete(user);
  }
}
