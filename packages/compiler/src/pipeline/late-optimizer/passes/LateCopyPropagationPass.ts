import {
  BaseInstruction,
  BlockId,
  CopyInstruction,
  DeclarationId,
  IdentifierId,
  LoadLocalInstruction,
  Place,
  StoreLocalInstruction,
} from "../../../ir";
import { LoadPhiInstruction } from "../../../ir/instructions/memory/LoadPhi";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";

/**
 * Forward copy propagation with copy coalescing — replaces loads of
 * copy-target variables with loads of the original source variable, and
 * eliminates intermediate variables that exist only to feed a phi copy.
 *
 * **Copy propagation** (forward): when a variable `x` is assigned the value
 * of another variable `y` (via a `CopyInstruction` or a `StoreLocal` whose
 * value was loaded from `y`), subsequent loads of `x` can be replaced with
 * loads of `y`, provided neither variable has been redefined in between.
 *
 * ```
 *   LoadLocal(p1, y)
 *   Copy(p2, x, p1)        // x = y
 *   ...
 *   LoadLocal(p3, x)        // → rewritten to LoadLocal(p3, y)
 * ```
 *
 * **Copy coalescing** (backward): when `StoreLocal(x, expr)` is followed by
 * `LoadLocal(tmp, x) → Copy(phi, tmp)` and `x` has no other loads, the
 * intermediate variable is unnecessary. The Copy is rewritten to reference
 * `expr` directly and the StoreLocal + LoadLocal are removed.
 *
 * ```
 *   BinaryExpr(p1, a, +, b)
 *   StoreLocal(p2, x, p1)   // const x = a + b   ← removed
 *   LoadLocal(p3, x)         // tmp = x            ← removed
 *   Copy(p4, phi, p3)        // phi = tmp          → phi = p1
 * ```
 *
 * The pass uses a forward dataflow analysis with an intersection meet
 * operator to propagate copy information across basic block boundaries.
 * Chains of copies (x = y, y = z) are resolved transitively so that
 * loads are rewritten to the ultimate source.
 *
 * This is especially effective at cleaning up artifacts from phi elimination.
 */
export class LateCopyPropagationPass extends BaseOptimizationPass {
  protected step(): OptimizationResult {
    let changed = false;
    changed ||= this.propagate();
    changed ||= this.coalesce();
    return { changed };
  }

  /**
   * Forward copy propagation: replaces loads of copy-target variables with
   * loads of the original source variable.
   *
   * Uses a forward dataflow analysis with an intersection meet operator to
   * propagate copy information across basic block boundaries.  Blocks are
   * processed in Map insertion order (roughly topological for reducible
   * CFGs).  The outer fixpoint loop in BaseOptimizationPass re-runs step()
   * until no more rewrites are found, handling back-edges in loops.
   */
  private propagate(): boolean {
    // Build a map from each SSA place to the variable it was loaded from.
    // This lets us trace which variable flows into a Copy/StoreLocal.
    const placeSource = new Map<IdentifierId, Place>();
    for (const block of this.functionIR.blocks.values()) {
      for (const instr of block.instructions) {
        if (instr instanceof LoadLocalInstruction) {
          placeSource.set(instr.place.identifier.id, instr.value);
        }
      }
    }

    const copyOut = new Map<BlockId, CopyState>();
    let changed = false;

    for (const [blockId, block] of this.functionIR.blocks) {
      const state = this.meetPredecessors(blockId, copyOut);

      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i];

        if (instr instanceof LoadLocalInstruction) {
          const resolved = this.resolve(state, instr.value.identifier.declarationId);
          if (
            resolved &&
            resolved.identifier.declarationId !== instr.value.identifier.declarationId
          ) {
            block.instructions[i] = new LoadLocalInstruction(
              instr.id,
              instr.place,
              instr.nodePath,
              resolved,
            );
            placeSource.set(instr.place.identifier.id, resolved);
            changed = true;
          }
        }

        this.transfer(block.instructions[i], state, placeSource);
      }

      copyOut.set(blockId, state);
    }

    return changed;
  }

  /**
   * Copy coalescing: for each Copy whose value comes from a LoadLocal of a
   * single-use variable, retarget the Copy to the expression that defined
   * that variable and delete the intermediate StoreLocal + LoadLocal.
   */
  private coalesce(): boolean {
    // Count how many times each SSA variable is loaded.  We key by the
    // lval's IdentifierId (unique per SSA version), NOT DeclarationId
    // (which is shared across versions like $2_0 and $2_1).
    const loadCounts = new Map<IdentifierId, number>();
    for (const block of this.functionIR.blocks.values()) {
      for (const instr of block.instructions) {
        // Count both LoadLocal and LoadPhi — both read a variable by
        // identifierId and prevent coalescing if the count exceeds 1.
        if (instr instanceof LoadLocalInstruction || instr instanceof LoadPhiInstruction) {
          const id = instr.value.identifier.id;
          loadCounts.set(id, (loadCounts.get(id) ?? 0) + 1);
        }
      }
    }

    let changed = false;

    for (const block of this.functionIR.blocks.values()) {
      // Index the last StoreLocal per SSA variable (by lval IdentifierId).
      const storeById = new Map<
        IdentifierId,
        { index: number; instr: StoreLocalInstruction }
      >();
      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i];
        if (instr instanceof StoreLocalInstruction) {
          storeById.set(instr.lval.identifier.id, { index: i, instr });
        }
      }

      const toRemove = new Set<number>();

      for (let i = 0; i < block.instructions.length; i++) {
        const copy = block.instructions[i];
        if (!(copy instanceof CopyInstruction)) continue;

        // Walk backward to find the LoadLocal whose output feeds this Copy.
        let loadIdx = -1;
        let loadInstr: LoadLocalInstruction | undefined;
        for (let j = i - 1; j >= 0; j--) {
          const candidate = block.instructions[j];
          if (
            candidate instanceof LoadLocalInstruction &&
            candidate.place.identifier.id === copy.value.identifier.id
          ) {
            loadIdx = j;
            loadInstr = candidate;
            break;
          }
        }
        if (loadIdx === -1 || !loadInstr) continue;

        const srcId = loadInstr.value.identifier.id;

        // The variable must be loaded exactly once (this LoadLocal only).
        if ((loadCounts.get(srcId) ?? 0) !== 1) continue;

        // Find the StoreLocal that defined this variable in the same block.
        const store = storeById.get(srcId);
        if (!store || store.index >= loadIdx) continue;
        // Don't coalesce if the StoreLocal was already marked for removal
        // by an earlier coalescing in this block.
        if (toRemove.has(store.index)) continue;

        // Rewrite: Copy now references the expression directly.
        block.instructions[i] = new CopyInstruction(
          copy.id,
          copy.place,
          copy.nodePath,
          copy.lval,
          store.instr.value,
        );

        toRemove.add(store.index); // Remove StoreLocal
        toRemove.add(loadIdx); // Remove LoadLocal
        changed = true;
      }

      if (toRemove.size > 0) {
        block.instructions = block.instructions.filter((_, idx) => !toRemove.has(idx));
      }
    }

    return changed;
  }

  /**
   * Compute the copy state at the entry of a block by intersecting the
   * copy-out states of all predecessors.  Only copy relationships that
   * agree across every predecessor survive.
   *
   * A predecessor whose copy-out has not been computed yet (e.g. a
   * back-edge target processed before its predecessor) is treated as
   * "top" (the universal set) — the intersection identity — so it does
   * not kill valid copy information from other predecessors.
   */
  private meetPredecessors(blockId: BlockId, copyOut: Map<BlockId, CopyState>): CopyState {
    const preds = this.functionIR.predecessors.get(blockId);
    if (!preds || preds.size === 0) {
      return new Map();
    }

    let result: CopyState | undefined;
    for (const predId of preds) {
      const predState = copyOut.get(predId);
      if (predState === undefined) {
        // Not yet computed — treat as top (identity for intersection).
        continue;
      }
      if (result === undefined) {
        result = new Map(predState);
      } else {
        // Intersect: keep only entries present in both that agree on source.
        for (const [declId, place] of result) {
          const other = predState.get(declId);
          if (
            !other ||
            other.identifier.declarationId !== place.identifier.declarationId
          ) {
            result.delete(declId);
          }
        }
      }
    }

    return result ?? new Map();
  }

  /**
   * Transfer function: update the copy state for a single instruction.
   *
   *  - CopyInstruction / StoreLocal whose value was loaded from a
   *    variable: kill the target declaration, then record it as a copy
   *    of the (transitively resolved) source variable.
   *  - StoreLocal whose value is NOT from a LoadLocal: just kill the
   *    target declaration (the variable is no longer a known copy).
   */
  private transfer(
    instr: BaseInstruction,
    state: CopyState,
    placeSource: Map<IdentifierId, Place>,
  ): void {
    if (instr instanceof CopyInstruction || instr instanceof StoreLocalInstruction) {
      const lvalDeclId = instr.lval.identifier.declarationId;

      // Kill: the target variable is being (re)defined.
      this.kill(state, lvalDeclId);

      // Gen: if the stored value was loaded from a variable, record the copy.
      const src = placeSource.get(instr.value.identifier.id);
      if (src) {
        const resolved = this.resolve(state, src.identifier.declarationId) ?? src;
        // Avoid recording self-copies (x = x).
        if (resolved.identifier.declarationId !== lvalDeclId) {
          state.set(lvalDeclId, resolved);
        }
      }
    }
  }

  /**
   * Remove `declId` from the copy state and invalidate any entry whose
   * source variable matches `declId` (since that source was just
   * redefined, copies derived from it are no longer valid).
   */
  private kill(state: CopyState, declId: DeclarationId): void {
    state.delete(declId);
    for (const [key, val] of state) {
      if (val.identifier.declarationId === declId) {
        state.delete(key);
      }
    }
  }

  /**
   * Follow the copy chain for `declId` to its ultimate source.
   * Returns `undefined` if `declId` has no copy mapping.
   */
  private resolve(state: CopyState, declId: DeclarationId): Place | undefined {
    const visited = new Set<DeclarationId>();
    let current = declId;
    let result: Place | undefined;

    while (!visited.has(current)) {
      visited.add(current);
      const source = state.get(current);
      if (!source) break;
      result = source;
      current = source.identifier.declarationId;
    }

    return result;
  }
}

type CopyState = Map<DeclarationId, Place>;
