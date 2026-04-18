import { Environment } from "../../environment";
import { Value } from "./Value";
import { type LexicalScopeKind } from "./LexicalScope";
import type { ModuleIR } from "./ModuleIR";
import type { CloneContext } from "./Operation";
import { Operation, Trait } from "./Operation";
import type { Region } from "./Region";
import { Terminal } from "../ops/control";

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
// Use-chain helpers
// ---------------------------------------------------------------------------

type UseChainNode = {
  getOperands(): readonly Value[];
  getDefs?: () => readonly Value[];
  getBlockRefs?: () => readonly BasicBlock[];
};

function registerUses(user: UseChainNode): void {
  for (const value of user.getOperands()) {
    value._addUse(user);
  }
  if (user.getDefs) {
    for (const value of user.getDefs()) {
      value._setDefiner(user);
    }
  }
  if (user.getBlockRefs) {
    for (const block of user.getBlockRefs()) {
      block._addUse(user);
    }
  }
}

function unregisterUses(user: UseChainNode): void {
  for (const value of user.getOperands()) {
    value._removeUse(user);
  }
  if (user.getDefs) {
    for (const value of user.getDefs()) {
      value._clearDefinerIf(user);
    }
  }
  if (user.getBlockRefs) {
    for (const block of user.getBlockRefs()) {
      block._removeUse(user);
    }
  }
}

function attach(op: Operation | undefined, block: BasicBlock): void {
  if (op !== undefined) {
    op.parentBlock = block;
  }
}

function detach(op: Operation | undefined): void {
  if (op !== undefined) {
    op.parentBlock = null;
  }
}

// ---------------------------------------------------------------------------
// BasicBlock
// ---------------------------------------------------------------------------

/**
 * A textbook MLIR basic block: an ordered list of operations whose
 * last op is a terminator.
 *
 * `_ops` is the physical list of every operation owned by this
 * block, in program order. No parallel storage slots. Structured
 * ops (IfOp, WhileOp, ForOfOp, ...) are just ordinary ops in this
 * list — they can appear anywhere, in any order, alongside regular
 * instructions. The block's terminator (the op with
 * `Trait.Terminator`) must be the LAST op in `_ops` if it exists.
 */
export class BasicBlock {
  private _ops: Operation[] = [];

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
   *
   * Private; external code reads via {@link predecessors}.
   */
  readonly #uses: Set<UseChainNode> = new Set();

  constructor(
    public readonly id: BlockId,
    initialOps: Operation[],
    terminal: Terminal | undefined,
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
      this._ops.push(terminal);
      registerUses(terminal);
      attach(terminal, this);
    }
  }

  // -----------------------------------------------------------------------
  // Op storage
  // -----------------------------------------------------------------------

  /** Index of the terminator in `_ops`, or -1 if absent. */
  private terminatorIndex(): number {
    const n = this._ops.length;
    if (n === 0) return -1;
    return this._ops[n - 1].hasTrait(Trait.Terminator) ? n - 1 : -1;
  }

  /**
   * All non-terminator ops in the block, in program order. Includes
   * structured ops (IfOp / WhileOp / ...) — they are ordinary ops
   * in the sequence, no longer segregated into a separate slot.
   */
  get operations(): readonly Operation[] {
    const ti = this.terminatorIndex();
    if (ti < 0) return this._ops;
    return this._ops.slice(0, ti);
  }

  get terminal(): Terminal | undefined {
    const ti = this.terminatorIndex();
    return ti >= 0 ? (this._ops[ti] as Terminal) : undefined;
  }

  set terminal(newTerminal: Terminal | undefined) {
    if (newTerminal !== undefined && !newTerminal.hasTrait(Trait.Terminator)) {
      throw new Error(
        `BasicBlock.terminal setter: op ${newTerminal.constructor.name} lacks Trait.Terminator`,
      );
    }
    const ti = this.terminatorIndex();
    if (ti >= 0) {
      detach(this._ops[ti]);
      unregisterUses(this._ops[ti]);
      if (newTerminal === undefined) {
        this._ops.splice(ti, 1);
      } else {
        this._ops[ti] = newTerminal;
        registerUses(newTerminal);
        attach(newTerminal, this);
      }
    } else if (newTerminal !== undefined) {
      this._ops.push(newTerminal);
      registerUses(newTerminal);
      attach(newTerminal, this);
    }
  }

  /** The last op in the block — terminator if present, else last instr. */
  get lastOp(): Operation | undefined {
    return this._ops[this._ops.length - 1];
  }

  // -----------------------------------------------------------------------
  // Instruction mutations
  // -----------------------------------------------------------------------

  /** Append a non-terminator op before the terminator (or at the end). */
  appendOp(op: Operation): void {
    if (op.hasTrait(Trait.Terminator)) {
      throw new Error(
        `BasicBlock.appendOp: use the terminal setter for terminators (got ${op.constructor.name})`,
      );
    }
    registerUses(op);
    attach(op, this);
    const ti = this.terminatorIndex();
    if (ti >= 0) {
      this._ops.splice(ti, 0, op);
    } else {
      this._ops.push(op);
    }
  }

  /** Append a non-terminator op to the end of the block, unconditionally. */
  pushOp(op: Operation): void {
    if (op.hasTrait(Trait.Terminator)) {
      throw new Error(
        `BasicBlock.pushOp: use the terminal setter for terminators (got ${op.constructor.name})`,
      );
    }
    registerUses(op);
    attach(op, this);
    this._ops.push(op);
  }

  /**
   * Replace `oldOp` with `newOp` by identity. Works for both regular
   * ops and terminators, but terminator-ness must be preserved — a
   * terminator can only be swapped for a terminator, and a regular op
   * for a regular op.
   */
  replaceOp(oldOp: Operation, newOp: Operation): void {
    const index = this._ops.indexOf(oldOp);
    if (index < 0) {
      throw new Error(
        `BasicBlock.replaceOp: op ${oldOp.constructor.name} not found in bb${this.id}`,
      );
    }
    const oldIsTerm = oldOp.hasTrait(Trait.Terminator);
    const newIsTerm = newOp.hasTrait(Trait.Terminator);
    if (oldIsTerm !== newIsTerm) {
      throw new Error(
        `BasicBlock.replaceOp: terminator-ness mismatch (old=${oldOp.constructor.name} term=${oldIsTerm}, new=${newOp.constructor.name} term=${newIsTerm})`,
      );
    }
    if (oldOp === newOp) return;
    detach(oldOp);
    unregisterUses(oldOp);
    registerUses(newOp);
    attach(newOp, this);
    this._ops[index] = newOp;
  }

  /** Remove the op at `index` (addressing the non-terminator slice). */
  removeOpAt(index: number): void {
    const end = this.terminatorIndex() >= 0 ? this.terminatorIndex() : this._ops.length;
    if (index < 0 || index >= end) {
      throw new Error(`BasicBlock.removeOpAt: index ${index} is out of range [0, ${end})`);
    }
    detach(this._ops[index]);
    unregisterUses(this._ops[index]);
    this._ops.splice(index, 1);
  }

  /** Insert an op at `index` (addressing the non-terminator slice). */
  insertOpAt(index: number, op: Operation): void {
    const end = this.terminatorIndex() >= 0 ? this.terminatorIndex() : this._ops.length;
    if (index < 0 || index > end) {
      throw new Error(`BasicBlock.insertOpAt: index ${index} is out of range [0, ${end}]`);
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

  /** Remove all non-terminator ops, preserving the terminator. */
  clearInstructions(): void {
    const end = this.terminatorIndex() >= 0 ? this.terminatorIndex() : this._ops.length;
    for (let i = 0; i < end; i++) {
      detach(this._ops[i]);
      unregisterUses(this._ops[i]);
    }
    this._ops.splice(0, end);
  }

  /**
   * Absorb all ops from `other` into this block. Ops are moved — their
   * instance identity and use-chain registrations are preserved.
   *
   * The target block must not already have a terminator.
   */
  absorbFrom(other: BasicBlock): void {
    if (this.terminatorIndex() >= 0) {
      throw new Error(`BasicBlock.absorbFrom: target bb${this.id} still has a terminator`);
    }
    for (const op of other._ops) {
      attach(op, this);
      this._ops.push(op);
    }
    other._ops = [];
  }

  /**
   * Remove and return ops from `start` to the end of the non-terminator
   * slice. Ops are moved; caller inherits use-chain registrations.
   */
  spliceInstructions(start: number): Operation[] {
    const end = this.terminatorIndex() >= 0 ? this.terminatorIndex() : this._ops.length;
    if (start >= end) return [];
    const removed = this._ops.splice(start, end - start);
    for (const op of removed) detach(op);
    return removed;
  }

  // -----------------------------------------------------------------------
  // Walkers
  // -----------------------------------------------------------------------

  /** Yield every op in this block in program order. */
  *getAllOps(): IterableIterator<Operation> {
    for (const op of this._ops) yield op;
  }

  get numOps(): number {
    return this._ops.length;
  }

  // -----------------------------------------------------------------------
  // CFG use-list — predecessors, always current
  //
  // Every op whose `getBlockRefs()` includes this block is recorded
  // in `#uses` by the register/unregister helpers above. That means
  // "who jumps here?" is a walk of the use-list, never a scan of the
  // whole function. The LLVM/MLIR model: predecessors are a property
  // of the block, not a separate analysis.
  // -----------------------------------------------------------------------

  /** @internal */
  _addUse(user: UseChainNode): void {
    this.#uses.add(user);
  }

  /** @internal */
  _removeUse(user: UseChainNode): void {
    this.#uses.delete(user);
  }

  /** Iterate every op (across the function) whose block-refs include this block. */
  *uses(): IterableIterator<UseChainNode> {
    yield* this.#uses;
  }

  get useCount(): number {
    return this.#uses.size;
  }

  hasUses(): boolean {
    return this.#uses.size > 0;
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

  /**
   * The ECMAScript lexical scope kind this block executes within,
   * derived by walking the region-parent chain upward.
   */
  get resolvedScopeKind(): LexicalScopeKind | undefined {
    let region: Region | null = this.parent;
    while (region !== null) {
      if (region.scopeKind !== undefined) return region.scopeKind;
      const owningOp = region.parent;
      if (owningOp === null) return undefined;
      region = owningOp.parentBlock?.parent ?? null;
    }
    return undefined;
  }

  /**
   * Rewrite all ops through the given identifier → place mapping.
   */
  rewriteAll(values: Map<Value, Value>): void {
    for (let i = 0; i < this._ops.length; i++) {
      const op = this._ops[i];
      const rewritten = op.rewrite(values);
      if (rewritten !== op) {
        detach(op);
        unregisterUses(op);
        registerUses(rewritten);
        attach(rewritten, this);
        this._ops[i] = rewritten;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Deep cloning — phase 1 / phase 2
  // -----------------------------------------------------------------------

  /**
   * Phase-1 deep clone. Clones each non-region op with empty maps.
   * Region-owning ops are deferred to phase 2 because their clone()
   * calls remapRegion, which requires every block to already exist
   * in the target module's blockMap.
   */
  public clone(moduleIR: ModuleIR): BasicBlock {
    const environment = moduleIR.environment;
    const newBlock = environment.createBlock();
    const ctx: CloneContext = {
      environment,
      moduleIR,
      blockMap: new Map(),
      valueMap: new Map(),
    };
    for (const op of this._ops) {
      if (op.hasTrait(Trait.HasRegions)) continue;
      const cloned = op.clone(ctx);
      newBlock._ops.push(cloned);
      registerUses(cloned);
      attach(cloned, newBlock);
    }
    newBlock.params = [...this.params];
    return newBlock;
  }

  /**
   * Phase-2 deep clone. Rewrites every op's operands through
   * `valueMap`, and re-clones the terminal and any region-owning
   * ops through `blockMap` + `valueMap`.
   */
  public rewrite(
    environment: Environment,
    blockMap: Map<BasicBlock, BasicBlock>,
    valueMap: Map<Value, Value>,
    options: { rewriteDefinitions?: boolean } = {},
  ): void {
    const ctx: CloneContext = {
      environment,
      moduleIR: undefined,
      blockMap,
      valueMap,
    };
    for (let i = 0; i < this._ops.length; i++) {
      const op = this._ops[i];
      if (op.hasTrait(Trait.Terminator)) {
        detach(op);
        unregisterUses(op);
        const rewritten = op.clone(ctx) as Terminal;
        registerUses(rewritten);
        attach(rewritten, this);
        this._ops[i] = rewritten;
      } else {
        const rewritten = op.rewrite(valueMap, options) as Operation & {
          readonly place: Value;
        };
        if (rewritten !== op) {
          detach(op);
          unregisterUses(op);
          registerUses(rewritten);
          attach(rewritten, this);
          this._ops[i] = rewritten;
        }
      }
    }
    if (this.params.length > 0) {
      const newParams: Value[] = [];
      let changed = false;
      for (const param of this.params) {
        const mapped = valueMap.get(param) ?? param;
        if (mapped !== param) changed = true;
        newParams.push(mapped);
      }
      if (changed) this.params = newParams;
    }
  }
}
