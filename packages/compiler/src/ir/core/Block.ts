import { Environment } from "../../environment";
import { Identifier } from "./Identifier";
import { type LexicalScopeId } from "./LexicalScope";
import type { ModuleIR } from "./ModuleIR";
import type { CloneContext } from "./Operation";
import { Operation, Trait } from "./Operation";
import { Place } from "./Place";
import type { Region } from "./Region";
import { Terminal } from "../ops/control";

/**
 * Simulated opaque type for BlockId to prevent using normal numbers as ids
 * accidentally.
 */
const opaqueBlockId = Symbol();
export type BlockId = number & { [opaqueBlockId]: "BlockId" };

export function makeBlockId(id: number): BlockId {
  return id as BlockId;
}

// ---------------------------------------------------------------------------
// Use-chain helpers (not exported — only used by BasicBlock methods)
// ---------------------------------------------------------------------------

type UseChainNode = {
  getOperands(): readonly Place[];
  getDefs?: () => readonly Place[];
};

function registerUses(user: UseChainNode): void {
  for (const place of user.getOperands()) {
    place.identifier.uses.add(user);
  }
  if (user.getDefs) {
    for (const place of user.getDefs()) {
      place.identifier.definer = user;
    }
  }
}

function unregisterUses(user: UseChainNode): void {
  for (const place of user.getOperands()) {
    place.identifier.uses.delete(user);
  }
  if (user.getDefs) {
    for (const place of user.getDefs()) {
      if (place.identifier.definer === user) {
        place.identifier.definer = undefined;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// BasicBlock
// ---------------------------------------------------------------------------

export class BasicBlock {
  /**
   * Single-array op storage (MLIR invariant): `_ops` is the physical
   * operation list for this block, with the terminator — if any —
   * stored at the last index. There are no parallel `_terminal` or
   * `_instructions` fields: `operations`, `terminal`, and `getAllOps()`
   * are all views over this single array.
   *
   * Public accessors preserve the historical two-field API:
   *
   *   - `operations` — non-terminal instructions (cached view).
   *   - `terminal`   — last element when it has `Trait.Terminator`.
   *   - `getAllOps()`— full iteration in program order.
   *
   * The `_instructionsCache` holds the memoized non-terminal slice;
   * every mutation helper nulls it out so the next `operations` read
   * rebuilds from `_ops`.
   */
  private _ops: Operation[] = [];
  private _instructionsCache: Operation[] | null = null;
  private _structure: Operation | undefined;

  /**
   * MLIR-style region ownership back-pointer: the {@link Region} this
   * block belongs to. The function's top-level body region is the
   * parent of all blocks that sit directly in the function; structured
   * ops' nested regions are the parents of blocks owned by those
   * structures.
   *
   * `null` while a block is being constructed and not yet attached to
   * a region. Maintained automatically by `Region.appendBlock`,
   * `Region.removeBlock`, and `Region.moveBlockHere`.
   */
  public parent: Region | null = null;

  constructor(
    public readonly id: BlockId,
    public readonly scopeId: LexicalScopeId,
    initialOps: Operation[],
    terminal: Terminal | undefined,
  ) {
    // Populate `_ops` with instructions first, then the terminator
    // (if any). Use-chains are registered explicitly here because we
    // bypass the mutating helpers during construction.
    for (const op of initialOps) {
      this._ops.push(op);
      registerUses(op);
    }
    if (terminal !== undefined) {
      this._ops.push(terminal);
      registerUses(terminal);
    }
  }

  // -----------------------------------------------------------------------
  // Cache / invariant helpers
  // -----------------------------------------------------------------------

  private invalidateInstructionsCache(): void {
    this._instructionsCache = null;
  }

  /** Index of the terminator in `_ops`, or -1 if absent. */
  private terminatorIndex(): number {
    const n = this._ops.length;
    if (n === 0) return -1;
    const last = this._ops[n - 1];
    return last.hasTrait(Trait.Terminator) ? n - 1 : -1;
  }

  /**
   * Public view of instructions (non-terminal ops). Cached — a fresh
   * slice is built only when the underlying `_ops` has been mutated
   * since the last read.
   */
  get operations(): readonly Operation[] {
    if (this._instructionsCache !== null) return this._instructionsCache;
    const ti = this.terminatorIndex();
    this._instructionsCache = ti >= 0 ? this._ops.slice(0, ti) : this._ops.slice();
    return this._instructionsCache;
  }

  /** Terminal accessor — the setter auto-maintains use-chains. */
  get terminal(): Terminal | undefined {
    const ti = this.terminatorIndex();
    return ti >= 0 ? (this._ops[ti] as Terminal) : undefined;
  }

  set terminal(newTerminal: Terminal | undefined) {
    const ti = this.terminatorIndex();
    if (ti >= 0) {
      unregisterUses(this._ops[ti]);
      if (newTerminal === undefined) {
        this._ops.splice(ti, 1);
      } else {
        this._ops[ti] = newTerminal;
        registerUses(newTerminal);
      }
    } else if (newTerminal !== undefined) {
      this._ops.push(newTerminal);
      registerUses(newTerminal);
    }
    this.invalidateInstructionsCache();
  }

  /**
   * Structured control-flow op attached to this block — the former
   * `FunctionIR.structures.get(blockId)` overlay moved onto the block
   * itself. A block has at most one structure op. Parallel to
   * {@link terminal}: one block, one structure, accessed via a
   * setter that maintains use-chains.
   *
   * `null` / `undefined` means the block is a plain basic block with
   * no structured-CF role.
   */
  get structure(): Operation | undefined {
    return this._structure;
  }

  set structure(newStructure: Operation | undefined) {
    if (this._structure) unregisterUses(this._structure);
    if (newStructure) registerUses(newStructure);
    this._structure = newStructure;
  }

  // -----------------------------------------------------------------------
  // Instruction mutations — automatically maintain Identifier.uses and
  // the MLIR invariant that the terminator is the last element in `_ops`.
  //
  // The public `index` parameter of these helpers addresses the
  // non-terminal instruction slice (`operations`), NOT `_ops`. Inserting
  // at `operations.length` appends before the terminator; replacing at
  // `operations.length - 1` replaces the last instruction (not the
  // terminator — use the `terminal` setter for that).
  // -----------------------------------------------------------------------

  /** Append an instruction (before the terminator) and register uses. */
  appendOp(instr: Operation): void {
    registerUses(instr);
    const ti = this.terminatorIndex();
    if (ti >= 0) {
      this._ops.splice(ti, 0, instr);
    } else {
      this._ops.push(instr);
    }
    this.invalidateInstructionsCache();
  }

  /** Replace the instruction at instruction-space `index`. */
  replaceOp(index: number, newInstr: Operation): void {
    const old = this._ops[index];
    unregisterUses(old);
    registerUses(newInstr);
    this._ops[index] = newInstr;
    this.invalidateInstructionsCache();
  }

  /** Remove the instruction at instruction-space `index`. */
  removeOpAt(index: number): void {
    unregisterUses(this._ops[index]);
    this._ops.splice(index, 1);
    this.invalidateInstructionsCache();
  }

  /** Insert an instruction at instruction-space `index`. */
  insertOpAt(index: number, instr: Operation): void {
    registerUses(instr);
    this._ops.splice(index, 0, instr);
    this.invalidateInstructionsCache();
  }

  /** Remove all non-terminal instructions, preserving any terminator. */
  clearInstructions(): void {
    const ti = this.terminatorIndex();
    const end = ti >= 0 ? ti : this._ops.length;
    for (let i = 0; i < end; i++) {
      unregisterUses(this._ops[i]);
    }
    this._ops.splice(0, end);
    this.invalidateInstructionsCache();
  }

  /**
   * Absorb all ops (instructions + terminator) from `other` into this
   * block. Ops are *moved* — their instance identity and use-chain
   * registrations are preserved. After the call `other._ops` is empty.
   *
   * The current block must not already have a terminator unless
   * `other` has none either; otherwise we'd end up with a terminator
   * in a non-last position, violating the single-array invariant.
   *
   * Used by CFGSimplificationPass to merge a block into its predecessor
   * after the predecessor's terminator has been detached.
   */
  absorbFrom(other: BasicBlock): void {
    if (this.terminatorIndex() >= 0) {
      throw new Error(`BasicBlock.absorbFrom: target bb${this.id} still has a terminator`);
    }
    for (const op of other._ops) {
      this._ops.push(op);
    }
    other._ops = [];
    this.invalidateInstructionsCache();
    other.invalidateInstructionsCache();
  }

  /**
   * Remove and return instructions from index `start` (instruction-space)
   * to the end of the non-terminal instruction list. The terminator is
   * never returned. Ops are *moved* — caller inherits use-chain
   * registrations. Used by frontend param-header reordering.
   */
  spliceInstructions(start: number): Operation[] {
    const ti = this.terminatorIndex();
    const end = ti >= 0 ? ti : this._ops.length;
    if (start >= end) return [];
    const removed = this._ops.splice(start, end - start);
    this.invalidateInstructionsCache();
    return removed;
  }

  // -----------------------------------------------------------------------
  // Terminal — convenience alias (delegates to setter)
  // -----------------------------------------------------------------------

  /** Replace the terminal and update use-chains. */
  replaceTerminal(newTerminal: Terminal | undefined): void {
    this.terminal = newTerminal;
  }

  // -----------------------------------------------------------------------
  // MLIR-style unified walker view — all backed by the single `_ops` array.
  // -----------------------------------------------------------------------

  /**
   * Yield every op in this block in program order: instructions first,
   * then the terminator (if any). Backed directly by `_ops`.
   */
  *getAllOps(): IterableIterator<Operation> {
    for (const op of this._ops) yield op;
  }

  /** Total number of ops in the block, including the terminator. */
  get numOps(): number {
    return this._ops.length;
  }

  /** The last op in the block — terminator if present, else last instr. */
  get lastOp(): Operation | undefined {
    return this._ops[this._ops.length - 1];
  }

  /**
   * Rewrite all ops — instructions and terminator alike — using the
   * given identifier → place mapping. Ops whose rewrite produces a
   * different object are replaced in place (with use-chain updates).
   */
  rewriteAll(values: Map<Identifier, Place>): void {
    for (let i = 0; i < this._ops.length; i++) {
      const op = this._ops[i];
      const rewritten = op.rewrite(values);
      if (rewritten !== op) {
        unregisterUses(op);
        registerUses(rewritten);
        this._ops[i] = rewritten;
        this.invalidateInstructionsCache();
      }
    }
  }

  // -----------------------------------------------------------------------
  // Deep cloning — phase 1 / phase 2
  // -----------------------------------------------------------------------

  /**
   * Phase-1 deep clone. Allocates a new block with the same scope, clones
   * each instruction (via {@link Operation.clone}), and clones the
   * terminal with empty maps so it gets a fresh instruction id but keeps
   * its old block/identifier references.
   *
   * Operands and the terminal still point at OLD identifiers / OLD block
   * ids. Call {@link rewrite} after the caller has built the cross-block
   * identifier and block maps to fix the references.
   */
  public clone(moduleIR: ModuleIR): BasicBlock {
    const environment = moduleIR.environment;
    const newBlock = environment.createBlock(this.scopeId);
    // Phase-1 clone with empty maps — get fresh ids but keep old
    // identifier/block references. Phase-2 rewrite() fixes them.
    const ctx: CloneContext = {
      moduleIR,
      blockMap: new Map(),
      identifierMap: new Map(),
    };
    for (const op of this._ops) {
      const cloned = op.clone(ctx);
      newBlock._ops.push(cloned);
      registerUses(cloned);
    }
    newBlock.invalidateInstructionsCache();
    return newBlock;
  }

  /**
   * Phase-2 deep clone. Rewrites every instruction's operands (and
   * optionally definition sites) through `identifierMap`, and re-clones
   * the terminal through both `blockMap` and `identifierMap` so its block
   * targets and operand references point at the new entities.
   *
   * Use-chains are maintained via {@link replaceOp} and
   * {@link replaceTerminal}.
   */
  public rewrite(
    environment: Environment,
    blockMap: Map<BlockId, BlockId>,
    identifierMap: Map<Identifier, Place>,
    options: { rewriteDefinitions?: boolean } = {},
  ): void {
    // Re-clone the terminal through the cross-block context so its
    // block targets and operand references point at the new entities.
    // The terminal's clone(ctx) ignores moduleIR.functions etc. — it
    // only needs environment for id allocation — so we wrap a stub
    // moduleIR.
    const ctx: CloneContext = {
      moduleIR: { environment } as unknown as CloneContext["moduleIR"],
      blockMap,
      identifierMap,
    };
    for (let i = 0; i < this._ops.length; i++) {
      const op = this._ops[i];
      if (op.hasTrait(Trait.Terminator)) {
        // Clone the terminator through blockMap + identifierMap.
        unregisterUses(op);
        const rewritten = op.clone(ctx) as Terminal;
        registerUses(rewritten);
        this._ops[i] = rewritten;
      } else {
        const rewritten = op.rewrite(identifierMap, options) as Operation & {
          readonly place: Place;
        };
        if (rewritten !== op) {
          unregisterUses(op);
          registerUses(rewritten);
          this._ops[i] = rewritten;
          environment.placeToOp.set(rewritten.place.id, rewritten);
        }
      }
    }
    this.invalidateInstructionsCache();
  }
}
