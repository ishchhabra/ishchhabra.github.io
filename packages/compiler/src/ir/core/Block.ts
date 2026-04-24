import { Value } from "./Value";
import { Operation } from "./Operation";
import { TermOp } from "./TermOp";
import type { Region } from "./Region";


/**
 * Simulated opaque type for BlockId to prevent using normal numbers
 * as ids accidentally.
 */
const opaqueBlockId = Symbol();
export type BlockId = number & { [opaqueBlockId]: "BlockId" };

export function makeBlockId(id: number): BlockId {
  return id as BlockId;
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
  private _terminal: TermOp | null = null;

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
   * Op-introduced entry bindings — values bound at this block's
   * entry by the enclosing structured op, distinct from SSA merge
   * params.
   *
   * Contains values like:
   *   - `ForOfOp.iterationValue` / destructured iter-target defs on
   *     the body region's entry block.
   *   - `TryOp.handlerParam` on the handler region's entry block.
   *
   * Treated differently from {@link params}:
   *   - Pushed onto the rename stack at block entry (like params).
   *   - **Not** counted as SSA-merge sinks by `SSAEliminator`.
   *   - **Not** wired through the edge infrastructure
   *     (`blockArgs.ts`) — their value is supplied by the runtime
   *     (iterator protocol / exception-throw mechanism), not via
   *     explicit operand forwarding from predecessor terminators.
   *   - Codegen doesn't emit a prelude `let = undefined` for them;
   *     the enclosing statement syntax (`for (let x of arr)`,
   *     `catch (e)`) declares them.
   *
   * This corresponds to MLIR's notion of block arguments that are
   * bound by the parent op itself. MLIR blurs the line between these
   * and SSA-merge block args because MLIR emits SSA-level code (LLVM
   * IR) where no prelude decls exist. Our JS target requires the
   * split.
   */
  public entryBindings: Value[] = [];

  /**
   * Intrusive use-list of terminators whose successor list includes
   * this block. Maintained automatically by `op.attach()` /
   * `op.detach()` on every mutation.
   */
  readonly #uses: Set<Operation> = new Set();

  constructor(
    public readonly id: BlockId,
    initialOps: Operation[] = [],
    terminal: TermOp | undefined = undefined,
  ) {
    for (const op of initialOps) {
      if (op instanceof TermOp) {
        throw new Error(
          `BasicBlock constructor: initialOps must not contain a terminator — pass it via the terminal parameter`,
        );
      }
      this._ops.push(op);
      op.attach(this);
    }
    if (terminal !== undefined) {
      this._terminal = terminal;
      terminal.attach(this);
    }
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /** Non-terminator ops in program order. */
  get operations(): readonly Operation[] {
    return this._ops;
  }

  get terminal(): TermOp | undefined {
    return this._terminal ?? undefined;
  }

  /** The last op in the block — terminator if present, else last non-terminator. */
  get lastOp(): Operation | undefined {
    return this._terminal ?? this._ops[this._ops.length - 1];
  }

  /** Attach a terminator to this block. Throws if one is already set. */
  setTerminal(terminal: TermOp): void {
    if (this._terminal !== null) {
      throw new Error(
        `Block ${this.id} already has terminal ${this._terminal.constructor.name}; refusing to overwrite with ${terminal.constructor.name}`,
      );
    }
    this._terminal = terminal;
    terminal.attach(this);
  }

  /** Swap this block's terminator for a new one. Throws if there is nothing to replace. */
  replaceTerminal(terminal: TermOp): void {
    if (this._terminal === null) {
      throw new Error(
        `Block ${this.id} has no terminal to replace; use setTerminal for the first assignment`,
      );
    }
    this._terminal.detach();
    this._terminal = terminal;
    terminal.attach(this);
  }

  // -----------------------------------------------------------------------
  // Mutation
  // -----------------------------------------------------------------------

  /** Append a non-terminator op. The terminator (if any) stays in place. */
  appendOp(op: Operation): void {
    if (op instanceof TermOp) {
      throw new Error(
        `BasicBlock.appendOp: use the terminal setter for terminators (got ${op.constructor.name})`,
      );
    }
    op.attach(this);
    this._ops.push(op);
  }

  /** Insert a non-terminator op at `index` in the non-terminator list. */
  insertOpAt(index: number, op: Operation): void {
    if (index < 0 || index > this._ops.length) {
      throw new Error(
        `BasicBlock.insertOpAt: index ${index} is out of range [0, ${this._ops.length}]`,
      );
    }
    if (op instanceof TermOp) {
      throw new Error(
        `BasicBlock.insertOpAt: cannot insert a terminator — use the terminal setter`,
      );
    }
    op.attach(this);
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
    removed.detach();
  }

  /**
   * Replace `oldOp` with `newOp` by identity. Terminator-ness must
   * match — you can't swap a regular op for a terminator or vice
   * versa.
   */
  replaceOp(oldOp: Operation, newOp: Operation): void {
    if (oldOp === newOp) return;
    const oldIsTerm = oldOp instanceof TermOp;
    const newIsTerm = newOp instanceof TermOp;
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
      oldOp.detach();
      newOp.attach(this);
      this._terminal = newOp as TermOp;
      return;
    }
    const index = this._ops.indexOf(oldOp);
    if (index < 0) {
      throw new Error(
        `BasicBlock.replaceOp: op ${oldOp.constructor.name} not found in bb${this.id}`,
      );
    }
    oldOp.detach();
    newOp.attach(this);
    this._ops[index] = newOp;
  }

  /**
   * Remove and return non-terminator ops from `start` to the end of
   * the list. This is a **move**, not a deletion: the ops keep their
   * operand/result use-list registrations intact because the caller
   * (currently `FuncOpBuilder.addHeaderOps`) re-homes them into a
   * different IR owner (`FuncOp.header`/`prologue`). Only the
   * `parentBlock` back-pointer is cleared, since they're no longer
   * inside this block.
   *
   * Do not use this for true removal — use `removeOpAt` so use-lists
   * unregister.
   */
  spliceInstructions(start: number): Operation[] {
    if (start >= this._ops.length) return [];
    const removed = this._ops.splice(start);
    for (const op of removed) op.parentBlock = null;
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
  _addUse(user: Operation): void {
    this.#uses.add(user);
  }

  /** @internal */
  _removeUse(user: Operation): void {
    this.#uses.delete(user);
  }

  /**
   * Read-only view of every terminator whose successor list includes
   * this block. Use {@link predecessors} for the set of predecessor
   * blocks.
   */
  get uses(): ReadonlySet<Operation> {
    return this.#uses;
  }

  /**
   * The set of blocks that can transfer control to this block via a
   * terminator with a direct block reference (currently: `JumpTermOp`).
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
