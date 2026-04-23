import { StoreContextOp, StoreLocalOp } from "../../ir";
import type { FuncOp } from "../../ir/core/FuncOp";
import type { DeclarationId } from "../../ir/core/Value";
import { ArrayDestructureOp } from "../../ir/ops/pattern/ArrayDestructure";
import { ObjectDestructureOp } from "../../ir/ops/pattern/ObjectDestructure";
import { Operation } from "../../ir/core/Operation";
import { AnalysisManager, FunctionAnalysis } from "./AnalysisManager";

/**
 * Any op that writes to a source-level declaration. Includes the
 * explicit store ops and every multi-def op that targets a binding
 * cell — destructures, for-of / for-in iteration vars, try/catch
 * handler params.
 */
export type StoreOp = Operation;

const NO_DEF_SITES: readonly StoreOp[] = Object.freeze([]);

/**
 * Per-function source-variable mutability information.
 *
 * For each {@link DeclarationId}, records the list of
 * {@link StoreLocalOp} / {@link StoreContextOp} ops that write to it in
 * the function body. This is a post-SSA re-projection of the DefSites
 * pre-pass from Cytron et al.'s SSA construction algorithm, at the
 * source-variable layer rather than the SSA-value layer.
 *
 * # Why a second layer?
 *
 * Post-SSA, the `Value`/`Value` axis already has use-def chains
 * and is single-assignment by construction. But our IR still carries
 * `DeclarationId` as a second identity axis — it survives SSA so
 * codegen can emit named source variables. A `let` declared once and
 * reassigned in a loop produces several `StoreLocalOp`s that share a
 * `DeclarationId` while having distinct `ValueId`s. SSA use-def
 * tells you "this read consumes that SSA value"; this analysis tells
 * you "this source variable has more than one assignment point."
 *
 * # Consumers
 *
 * - {@link ExpressionInliningPass} uses {@link isSingleAssignment} to
 *   confirm that a `const`-typed store is actually a true SSA binding
 *   before substituting it. The IR-level `type === "const"` flag is not
 *   sufficient: SSA destruction may emit multiple const-typed stores
 *   that share a declarationId.
 * - Future flow-insensitive fast paths in `LateConstantPropagationPass`
 *   and `LateCopyPropagationPass` can skip their kill/gen dataflow
 *   entirely for single-assignment decls.
 *
 * # Invalidation
 *
 * Depends only on the set of store ops in the function body. Preserve
 * across passes that rewrite operands without adding or removing stores;
 * invalidate after any pass that inserts, deletes, or retypes a store.
 */
export class MutabilityInfo {
  constructor(private readonly defSites: ReadonlyMap<DeclarationId, readonly StoreOp[]>) {}

  /**
   * Every store op that writes to `decl`, in the order they were
   * encountered during the region-walk. Empty for declarations with
   * no stores (parameters, imports, unbound names).
   */
  getDefSites(decl: DeclarationId): readonly StoreOp[] {
    return this.defSites.get(decl) ?? NO_DEF_SITES;
  }

  /** Number of store ops targeting `decl`. */
  getStoreCount(decl: DeclarationId): number {
    return this.defSites.get(decl)?.length ?? 0;
  }

  /**
   * True iff `decl` has exactly one store op in the function body.
   * This is the canonical "is this a true SSA binding?" query —
   * stronger than the IR-level `StoreLocalOp.type === "const"` flag.
   */
  isSingleAssignment(decl: DeclarationId): boolean {
    return this.getStoreCount(decl) === 1;
  }

  static compute(funcOp: FuncOp): MutabilityInfo {
    const defSites = new Map<DeclarationId, StoreOp[]>();
    const record = (decl: DeclarationId, op: StoreOp): void => {
      let sites = defSites.get(decl);
      if (sites === undefined) {
        sites = [];
        defSites.set(decl, sites);
      }
      sites.push(op);
    };
    for (const block of funcOp.allBlocks()) {
      for (const op of block.getAllOps()) {
        collectOpWriters(op, record);
      }
    }
    return new MutabilityInfo(defSites);
  }
}

/**
 * Call `record(declId, op)` for every source-level binding this op
 * writes to. Covers StoreLocal / StoreContext plus every multi-def
 * op that targets a binding: destructure patterns, for-of / for-in
 * iteration vars, try/catch handler params. Without destructure /
 * iter / catch here, mutability-driven passes (ExpressionInlining,
 * etc.) would miscount destructure-target bindings as
 * single-assignment and incorrectly inline their pre-destructure
 * value.
 */
function collectOpWriters(op: Operation, record: (decl: DeclarationId, op: StoreOp) => void): void {
  if (op instanceof StoreLocalOp || op instanceof StoreContextOp) {
    record(op.lval.declarationId, op);
    return;
  }
  if (op instanceof ArrayDestructureOp) {
    for (const def of op.getDefs()) {
      if (def === op.place) continue;
      record(def.declarationId, op);
    }
    return;
  }
  if (op instanceof ObjectDestructureOp) {
    for (const def of op.getDefs()) {
      if (def === op.place) continue;
      record(def.declarationId, op);
    }
    return;
  }
}

/**
 * Cached per-function {@link MutabilityInfo} — LLVM-style function
 * analysis. Depends on no other analyses.
 */
export class MutabilityAnalysis extends FunctionAnalysis<MutabilityInfo> {
  run(funcOp: FuncOp, _AM: AnalysisManager): MutabilityInfo {
    return MutabilityInfo.compute(funcOp);
  }
}
