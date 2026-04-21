import type { Environment } from "../../environment";
import type { BasicBlock, BlockId } from "../../ir";
import { Operation, Trait } from "../../ir/core/Operation";
import type { FuncOp } from "../../ir/core/FuncOp";
import { AliasOracle } from "./AliasOracle";
import { locationKey, type MemoryLocation } from "../../ir/memory/MemoryLocation";

/**
 * MemoryStateWalker — MLIR/Cranelift/TurboShaft-shaped memory analysis.
 *
 * Instead of a materialized MemorySSA-style overlay graph (LLVM's
 * design, rejected by every compiler built after ~2019), we expose a
 * stateless helper: given a function and a query point, return the
 * "last store" to each memory location visible at that point.
 *
 * Design choices (matching the modern consensus):
 *
 *   1. **No persistent graph.** Effects travel on ops (see
 *      `getMemoryEffects`). Reconstruction per query is cheap; there
 *      is nothing to invalidate after a transform.
 *   2. **Per-location last-store table.** Cranelift PR #4163:
 *      per-category coloring with a simple dataflow merge at block
 *      joins. No Cytron IDF, no MemoryPhi explicit nodes —
 *      join-point disambiguation is done on demand by the oracle.
 *   3. **Alias queries lazy.** Oracle is consulted only when a pass
 *      asks "what store does this load observe?", not preemptively
 *      for every op pair.
 *   4. **Single-function scope.** Cross-module memory reasoning is a
 *      summary-layer concern (see `ModuleSummary`).
 *
 * Consumers:
 *
 *   const walker = new MemoryStateWalker(funcOp);
 *   const store = walker.reachingStore(loadOp, location);
 *   // store: the Operation whose write last reached this load, or
 *   //         undefined if no store in this function dominates it
 *   //         (use "LiveOnEntry" semantics — read whatever the
 *   //         caller had).
 *
 * v1 scope: top-level region blocks. Nested structured regions are
 * treated as opaque: any effectful op inside a region widens the
 * reaching store to Unknown at the structured op's position. This
 * is sound, coarse, and easy to tighten later when DSE/GVN land.
 */
export class MemoryStateWalker {
  private readonly funcOp: FuncOp;
  private readonly env: Environment;
  private readonly oracle = new AliasOracle();

  /**
   * Per-op snapshot of "last reaching store per locationKey visible
   * at the op's entry." Built lazily on first query, reused across
   * queries on the same function.
   *
   * Entry = `undefined` means "LiveOnEntry" for that location — no
   * store in this function has reached this point.
   */
  private readonly snapshots = new Map<Operation, Map<string, Operation>>();
  private built = false;

  constructor(funcOp: FuncOp) {
    this.funcOp = funcOp;
    this.env = funcOp.moduleIR.environment;
  }

  /**
   * The last store reaching `op` that writes a location aliasing
   * `loc`. Returns `undefined` if no reaching store exists — caller
   * should treat as LiveOnEntry (external / pre-function memory).
   *
   * If multiple stores in the function alias `loc` and reach `op`
   * via different paths, returns `undefined` (multiple reaching
   * defs, no single answer) — callers that care about the merge
   * can walk `candidates(op, loc)` instead.
   */
  public reachingStore(op: Operation, loc: MemoryLocation): Operation | undefined {
    this.ensureBuilt();
    const snap = this.snapshots.get(op);
    if (snap === undefined) return undefined;
    // Exact-key fast path: if there's a store to precisely this
    // location, that's the reaching def.
    const exact = snap.get(locationKey(loc));
    if (exact !== undefined) return exact;
    // Alias fallback: scan the snapshot for any location that may
    // alias. If exactly one match, return it; else undefined (the
    // consumer must handle the merge or treat as conservative).
    let found: Operation | undefined;
    for (const [key, storeOp] of snap) {
      const storedLoc = this.locationFromKey(storeOp, key);
      if (storedLoc === undefined) continue;
      if (!this.oracle.mayAlias(loc, storedLoc)) continue;
      if (found !== undefined && found !== storeOp) return undefined;
      found = storeOp;
    }
    return found;
  }

  /**
   * All stores in this function that may alias `loc` and reach `op`.
   * Useful for alias-merge consumers (GVN over loads, LICM).
   */
  public *candidates(op: Operation, loc: MemoryLocation): IterableIterator<Operation> {
    this.ensureBuilt();
    const snap = this.snapshots.get(op);
    if (snap === undefined) return;
    const seen = new Set<Operation>();
    for (const [key, storeOp] of snap) {
      if (seen.has(storeOp)) continue;
      const storedLoc = this.locationFromKey(storeOp, key);
      if (storedLoc === undefined) continue;
      if (!this.oracle.mayAlias(loc, storedLoc)) continue;
      seen.add(storeOp);
      yield storeOp;
    }
  }

  // ---------------------------------------------------------------
  // Construction (lazy, per-function)
  // ---------------------------------------------------------------

  private ensureBuilt(): void {
    if (this.built) return;
    this.built = true;

    // Per-block exit states — the last-store map leaving each block
    // on each location key. Initially empty.
    const exitState = new Map<BlockId, Map<string, Operation>>();

    // Visit blocks in RPO (reverse post-order). The current
    // top-level region is single-region; RPO over successors gives
    // a dataflow-friendly visit order. Iterate to fixpoint on back
    // edges (loops).
    const rpo = this.reversePostOrder();

    let changed = true;
    let iter = 0;
    const MAX_ITER = 16; // plenty for natural loops; guard against bugs
    while (changed && iter++ < MAX_ITER) {
      changed = false;
      for (const block of rpo) {
        const entry = this.joinPredecessorStates(block, exitState);
        const opSnaps = this.walkBlock(block, entry);
        // Store the per-op snapshots (overwrite prior iteration —
        // the last fixpoint pass is the one that sticks).
        for (const [op, snap] of opSnaps) this.snapshots.set(op, snap);

        const exit = this.finalStateOf(block, entry);
        const prior = exitState.get(block.id);
        if (!sameState(prior, exit)) {
          exitState.set(block.id, exit);
          changed = true;
        }
      }
    }
  }

  /**
   * For each op in the block, record the entry state (last-store
   * map on arrival). Walking in program order, we update the
   * running map as we go past each effectful op.
   */
  private walkBlock(
    block: BasicBlock,
    entry: Map<string, Operation>,
  ): Map<Operation, Map<string, Operation>> {
    const snaps = new Map<Operation, Map<string, Operation>>();
    let state = new Map(entry);
    for (const op of block.operations) {
      // Snapshot the state *as the op sees it* (before its own
      // write takes effect).
      snaps.set(op, new Map(state));
      state = this.applyOpToState(op, state);
    }
    return snaps;
  }

  private finalStateOf(block: BasicBlock, entry: Map<string, Operation>): Map<string, Operation> {
    let state = new Map(entry);
    for (const op of block.operations) {
      state = this.applyOpToState(op, state);
    }
    return state;
  }

  /**
   * Apply an op's write effects to the running state. For a structured
   * op (any op with `HasRegions`) we summarize its nested regions'
   * writes — this is LLVM's FunctionModRefInfo at the block level.
   * Clearing *only* the cells those nested writes may alias, rather
   * than wiping the whole state, lets CP/DSE see through `if`/loop/
   * `try` boundaries as long as the body touches a disjoint set of
   * locations from the surrounding code.
   */
  private applyOpToState(op: Operation, state: Map<string, Operation>): Map<string, Operation> {
    const writes = op.hasTrait(Trait.HasRegions)
      ? this.collectNestedWrites(op)
      : op.getMemoryEffects(this.env).writes;
    if (writes.length === 0) return state;
    const hasUnknown = writes.some((w) => w.kind === "unknown");
    if (hasUnknown) {
      // Region body (or this op itself) makes an Unknown write —
      // e.g., contains a non-pure call whose effects we can't
      // bound. Conservatively wipe the state.
      const cleared = new Map<string, Operation>();
      cleared.set(locationKey({ kind: "unknown" }), op);
      return cleared;
    }
    const next = new Map(state);
    for (const w of writes) {
      for (const existingKey of [...next.keys()]) {
        const existingLoc = this.locationFromKey(next.get(existingKey)!, existingKey);
        if (existingLoc === undefined) continue;
        if (this.oracle.mayAlias(w, existingLoc)) next.delete(existingKey);
      }
      // Attribute each nested write to the outer structured op for
      // reaching-def purposes: consumers querying the surrounding
      // scope see "the structured op is the writer." Descent into
      // the nested region for finer-grained snapshots is a later
      // stage (requires a call-stack of region states).
      next.set(locationKey(w), op);
    }
    return next;
  }

  /**
   * Collect every memory write reachable from a structured op's
   * regions — recursively, across nested structured ops. Used to
   * summarize the effect of the whole structured op at its position
   * in the outer region.
   *
   * Soundness: the returned list is a superset of actual writes
   * (pessimistic on control flow — both arms of an if contribute).
   * `unknown` propagates: any nested call that escapes the alias
   * model taints the whole structured op.
   */
  private collectNestedWrites(
    op: Operation,
  ): import("../../ir/memory/MemoryLocation").MemoryLocation[] {
    const out: import("../../ir/memory/MemoryLocation").MemoryLocation[] = [];
    for (const region of op.regions) {
      for (const block of region.blocks) {
        for (const innerOp of block.operations) {
          if (innerOp.hasTrait(Trait.HasRegions)) {
            out.push(...this.collectNestedWrites(innerOp));
            continue;
          }
          const fx = innerOp.getMemoryEffects(this.env);
          out.push(...fx.writes);
        }
        const term = block.terminal;
        if (term !== undefined) {
          const fx = term.getMemoryEffects(this.env);
          out.push(...fx.writes);
        }
      }
    }
    return out;
  }

  /**
   * Merge predecessor exit states. Per-key rule: if every
   * predecessor agrees on the same writing op for a key, keep it;
   * otherwise the key is ambiguous (dropped → LiveOnEntry / oracle
   * fallback). This is the classic dataflow "intersection on
   * agreement" — the cheap alternative to materializing a MemoryPhi.
   */
  private joinPredecessorStates(
    block: BasicBlock,
    exitState: Map<BlockId, Map<string, Operation>>,
  ): Map<string, Operation> {
    const preds = [...block.predecessors()];
    if (preds.length === 0) return new Map();
    const first = exitState.get(preds[0].id);
    if (first === undefined) return new Map(); // unvisited predecessor — conservative
    if (preds.length === 1) return new Map(first);
    const joined = new Map<string, Operation>();
    for (const [key, op] of first) {
      let consistent = true;
      for (let i = 1; i < preds.length; i++) {
        const otherExit = exitState.get(preds[i].id);
        if (otherExit === undefined || otherExit.get(key) !== op) {
          consistent = false;
          break;
        }
      }
      if (consistent) joined.set(key, op);
    }
    return joined;
  }

  /**
   * RPO over top-level region blocks. Nested structured-op regions
   * aren't traversed at this scope — their effects are absorbed as
   * Unknown by the structured op itself (future work: per-region
   * summaries).
   */
  private reversePostOrder(): BasicBlock[] {
    const visited = new Set<BlockId>();
    const order: BasicBlock[] = [];
    const topLevelIds = new Set<BlockId>();
    for (const b of this.funcOp.body.blocks) topLevelIds.add(b.id);

    const visit = (block: BasicBlock): void => {
      if (visited.has(block.id)) return;
      visited.add(block.id);
      // Successors via CFG terminator refs.
      const term = block.terminal;
      if (term !== undefined) {
        for (const succ of term.getBlockRefs()) {
          if (topLevelIds.has(succ.id)) visit(succ);
        }
      }
      order.push(block);
    };
    visit(this.funcOp.entryBlock);
    order.reverse();
    return order;
  }

  /**
   * Given a storing op and the location key it wrote, return one of
   * the actual {@link MemoryLocation} records it writes. We could
   * cache this; for v1 we just re-read the op's effect signature.
   */
  private locationFromKey(op: Operation, key: string): MemoryLocation | undefined {
    const fx = op.getMemoryEffects(this.env);
    for (const w of fx.writes) if (locationKey(w) === key) return w;
    for (const r of fx.reads) if (locationKey(r) === key) return r;
    return undefined;
  }
}

function sameState(a: Map<string, Operation> | undefined, b: Map<string, Operation>): boolean {
  if (a === undefined) return false;
  if (a.size !== b.size) return false;
  for (const [k, v] of b) if (a.get(k) !== v) return false;
  return true;
}
