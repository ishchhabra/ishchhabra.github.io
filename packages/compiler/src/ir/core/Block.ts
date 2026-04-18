import { Value } from "./Value";
import { Operation, Trait } from "./Operation";
import type { Region } from "./Region";
import { Terminal } from "../ops/control";
import { registerUses, unregisterUses, type User } from "./Use";

/**
 * Simulated opaque type for BlockId to prevent using normal numbers
 * as ids accidentally.
 */
const opaqueBlockId = Symbol();
export type BlockId = number & { [opaqueBlockId]: "BlockId" };

export function makeBlockId(id: number): BlockId {
  return id as BlockId;
}

function attach(op: Operation, block: BasicBlock): void {
  op.parentBlock = block;
}

function detach(op: Operation): void {
  op.parentBlock = null;
}

// ---------------------------------------------------------------------------
// BasicBlock
// ---------------------------------------------------------------------------

/**
 * A textbook MLIR basic block: an ordered list of non-terminator
 * operations plus a terminator. Matches `mlir::Block`: non-terminator
 * ops live in one list, the terminator sits in its own slot. No
 * "terminator must be last in the array" invariant, no slice math.
 *
 * Structured ops (IfOp, WhileOp, ForOfOp, …) are ordinary non-terminator
 * ops — they live in `_ops` alongside regular instructions and can
 * appear at any position.
 */
export class BasicBlock {
  private _ops: Operation[] = [];
  private _terminal: Terminal | null = null;

  /**
   * MLIR-style region ownership back-pointer: the {@link Region}
   * this block belongs to.
   */
  public parent: Region | null = null;

  /**
   * MLIR / Cranelift-style block parameters. Populated by the SSA
   * builder when the block is a merge point in a multi-block region.
   */
  public params: Value[] = [];

  /**
   * Intrusive use-list of ops whose `getBlockRefs()` includes this
   * block. Maintained automatically by `registerUses`/`unregisterUses`
   * on every mutation. Reading this set is equivalent to "which
   * terminators refer to this block?" — i.e. the CFG predecessor
   * edges, always current, never stale.
   */
  readonly #uses: Set<User> = new Set();

  constructor(
    public readonly id: BlockId,
    initialOps: Operation[] = [],
    terminal: Terminal | undefined = undefined,
  ) {
    for (const op of initialOps) {
      if (op.hasTrait(Trait.Terminator)) {
        throw new Error(
          `BasicBlock constructor: initialOps must not contain a terminator — pass it via the terminal parameter`,
        );
      }
      this._ops.push(op);
      registerUses(op);
      attach(op, this);
    }
    if (terminal !== undefined) {
      this._terminal = terminal;
      registerUses(terminal);
      attach(terminal, this);
    }
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /** Non-terminator ops in program order. */
  get operations(): readonly Operation[] {
    return this._ops;
  }

  get terminal(): Terminal | undefined {
    return this._terminal ?? undefined;
  }

  set terminal(newTerminal: Terminal | undefined) {
    if (newTerminal !== undefined && !newTerminal.hasTrait(Trait.Terminator)) {
      throw new Error(
        `BasicBlock.terminal setter: op ${newTerminal.constructor.name} lacks Trait.Terminator`,
      );
    }
    if (this._terminal !== null) {
      detach(this._terminal);
      unregisterUses(this._terminal);
    }
    this._terminal = newTerminal ?? null;
    if (this._terminal !== null) {
      registerUses(this._terminal);
      attach(this._terminal, this);
    }
  }

  /** The last op in the block — terminator if present, else last non-terminator. */
  get lastOp(): Operation | undefined {
    return this._terminal ?? this._ops[this._ops.length - 1];
  }

  // -----------------------------------------------------------------------
  // Mutation
  // -----------------------------------------------------------------------

  /** Append a non-terminator op. The terminator (if any) stays in place. */
  appendOp(op: Operation): void {
    if (op.hasTrait(Trait.Terminator)) {
      throw new Error(
        `BasicBlock.appendOp: use the terminal setter for terminators (got ${op.constructor.name})`,
      );
    }
    registerUses(op);
    attach(op, this);
    this._ops.push(op);
  }

  /** Insert a non-terminator op at `index` in the non-terminator list. */
  insertOpAt(index: number, op: Operation): void {
    if (index < 0 || index > this._ops.length) {
      throw new Error(
        `BasicBlock.insertOpAt: index ${index} is out of range [0, ${this._ops.length}]`,
      );
    }
    if (op.hasTrait(Trait.Terminator)) {
      throw new Error(
        `BasicBlock.insertOpAt: cannot insert a terminator — use the terminal setter`,
      );
    }
    registerUses(op);
    attach(op, this);
    this._ops.splice(index, 0, op);
  }

  /** Remove the non-terminator op at `index`. */
  removeOpAt(index: number): void {
    if (index < 0 || index >= this._ops.length) {
      throw new Error(
        `BasicBlock.removeOpAt: index ${index} is out of range [0, ${this._ops.length})`,
      );
    }
    const [removed] = this._ops.splice(index, 1);
    detach(removed);
    unregisterUses(removed);
  }

  /**
   * Replace `oldOp` with `newOp` by identity. Terminator-ness must
   * match — you can't swap a regular op for a terminator or vice
   * versa.
   */
  replaceOp(oldOp: Operation, newOp: Operation): void {
    if (oldOp === newOp) return;
    const oldIsTerm = oldOp.hasTrait(Trait.Terminator);
    const newIsTerm = newOp.hasTrait(Trait.Terminator);
    if (oldIsTerm !== newIsTerm) {
      throw new Error(
        `BasicBlock.replaceOp: terminator-ness mismatch (old=${oldOp.constructor.name} term=${oldIsTerm}, new=${newOp.constructor.name} term=${newIsTerm})`,
      );
    }
    if (oldIsTerm) {
      if (this._terminal !== oldOp) {
        throw new Error(
          `BasicBlock.replaceOp: terminator ${oldOp.constructor.name} is not this block's terminal`,
        );
      }
      detach(oldOp);
      unregisterUses(oldOp);
      registerUses(newOp);
      attach(newOp, this);
      this._terminal = newOp as Terminal;
      return;
    }
    const index = this._ops.indexOf(oldOp);
    if (index < 0) {
      throw new Error(
        `BasicBlock.replaceOp: op ${oldOp.constructor.name} not found in bb${this.id}`,
      );
    }
    detach(oldOp);
    unregisterUses(oldOp);
    registerUses(newOp);
    attach(newOp, this);
    this._ops[index] = newOp;
  }

  /**
   * Remove and return non-terminator ops from `start` to the end of
   * the list. Ops are moved; caller inherits use-chain registrations
   * (nothing is unregistered).
   */
  spliceInstructions(start: number): Operation[] {
    if (start >= this._ops.length) return [];
    const removed = this._ops.splice(start);
    for (const op of removed) detach(op);
    return removed;
  }

  // -----------------------------------------------------------------------
  // Walkers
  // -----------------------------------------------------------------------

  /** Yield every op in this block in program order, terminator last. */
  *getAllOps(): IterableIterator<Operation> {
    for (const op of this._ops) yield op;
    if (this._terminal !== null) yield this._terminal;
  }

  // -----------------------------------------------------------------------
  // CFG use-list — predecessors, always current
  // -----------------------------------------------------------------------

  /** @internal */
  _addUse(user: User): void {
    this.#uses.add(user);
  }

  /** @internal */
  _removeUse(user: User): void {
    this.#uses.delete(user);
  }

  /**
   * Read-only view of every op whose `getBlockRefs()` includes this
   * block — i.e. the raw CFG in-edges. Use {@link predecessors} for
   * the set of predecessor blocks.
   */
  get uses(): ReadonlySet<User> {
    return this.#uses;
  }

  /**
   * The set of blocks that can transfer control to this block via a
   * terminator with a direct block reference (currently: `JumpOp`).
   *
   * Computed from the use-list, so always reflects the current IR —
   * there is no separate analysis to invalidate. Structured control
   * flow (IfOp arm yields, WhileOp iter-arg ports, …) is not
   * surfaced here because those edges are implicit in the region
   * structure, not in explicit block refs.
   */
  predecessors(): Set<BasicBlock> {
    const preds = new Set<BasicBlock>();
    for (const user of this.#uses) {
      const owning = (user as unknown as { parentBlock: BasicBlock | null }).parentBlock;
      if (owning !== null) preds.add(owning);
    }
    return preds;
  }
}
