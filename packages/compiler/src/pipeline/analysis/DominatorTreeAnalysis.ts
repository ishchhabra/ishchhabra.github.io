import type { BlockId } from "../../ir";
import { getDominanceFrontier, getDominators, getImmediateDominators } from "../../frontend/cfg";
import type { FunctionIR } from "../../ir/core/FunctionIR";
import { AnalysisManager, FunctionAnalysis } from "./AnalysisManager";

/**
 * Dominance information for a function's CFG, analogous to LLVM's
 * `llvm::DominatorTree`. Loop structure and back edges live in {@link LoopInfo}.
 *
 * Depends on current {@link FunctionIR#predecessors} / {@link FunctionIR#blocks}.
 * Obtain via {@link AnalysisManager#get} with {@link DominatorTreeAnalysis}, or
 * {@link DominatorTree.compute} when not using the analysis cache.
 */
export class DominatorTree {
  constructor(
    /** Entry block — the root of the dominator tree (LLVM: getRoot()). */
    private readonly rootBlock: BlockId,
    private readonly dominatorSets: ReadonlyMap<BlockId, ReadonlySet<BlockId>>,
    private readonly immediateDom: ReadonlyMap<BlockId, BlockId | undefined>,
    private readonly frontiers: ReadonlyMap<BlockId, ReadonlySet<BlockId>>,
  ) {}

  /** CFG entry block (dominator tree root). */
  getRoot(): BlockId {
    return this.rootBlock;
  }

  /** Immediate dominator of `block`, or `undefined` for the root. */
  getImmediateDominator(block: BlockId): BlockId | undefined {
    return this.immediateDom.get(block);
  }

  /**
   * Whether `a` dominates `b` (LLVM: `dominates` on `DominatorTree`).
   * Every block dominates itself.
   */
  dominates(a: BlockId, b: BlockId): boolean {
    return this.dominatorSets.get(b)?.has(a) ?? false;
  }

  /** True if `a` dominates `b` and `a !== b`. */
  properlyDominates(a: BlockId, b: BlockId): boolean {
    return a !== b && this.dominates(a, b);
  }

  /** Full dominator set for `block` (including the block itself). */
  getDominators(block: BlockId): ReadonlySet<BlockId> {
    return this.dominatorSets.get(block) ?? new Set();
  }

  /** Cytron et al. dominance frontier of `block`. */
  getDominanceFrontier(block: BlockId): ReadonlySet<BlockId> {
    return this.frontiers.get(block) ?? new Set();
  }

  /**
   * Read-only view of the immediate-dominator relation for passes that walk
   * the tree as a map (e.g. SSA renaming).
   */
  getImmediateDominators(): ReadonlyMap<BlockId, BlockId | undefined> {
    return this.immediateDom;
  }

  /**
   * Nearest common dominator of `a` and `b` on the idom tree
   * (LLVM: `findNearestCommonDominator`).
   */
  findNearestCommonDominator(a: BlockId, b: BlockId): BlockId {
    const ancestors = new Set<BlockId>();
    let x: BlockId | undefined = a;
    while (x !== undefined) {
      ancestors.add(x);
      x = this.getImmediateDominator(x);
    }
    let y: BlockId | undefined = b;
    while (y !== undefined && !ancestors.has(y)) {
      y = this.getImmediateDominator(y);
    }
    if (y === undefined) {
      throw new Error(`DominatorTree: no common dominator for blocks ${a} and ${b}`);
    }
    return y;
  }

  /**
   * Builds a tree from a function whose CFG edge maps are current
   * ({@link FunctionIR#recomputeCFG}).
   */
  static compute(functionIR: FunctionIR): DominatorTree {
    const entry = functionIR.entryBlockId;
    const dominators = getDominators(functionIR.predecessors, entry);
    const immediateDominators = getImmediateDominators(dominators);
    const dominanceFrontier = getDominanceFrontier(functionIR.predecessors, immediateDominators);

    const domReadonly = new Map<BlockId, ReadonlySet<BlockId>>();
    for (const [id, set] of dominators) {
      domReadonly.set(id, set);
    }
    const idomReadonly = new Map(immediateDominators);
    const dfReadonly = new Map<BlockId, ReadonlySet<BlockId>>();
    for (const [id, set] of dominanceFrontier) {
      dfReadonly.set(id, set);
    }

    return new DominatorTree(entry, domReadonly, idomReadonly, dfReadonly);
  }
}

/**
 * Cached {@link DominatorTree} for a function (LLVM: `DominatorTreeAnalysis`).
 *
 * Call {@link FunctionIR#recomputeCFG} after structural CFG edits, then
 * {@link AnalysisManager#invalidateFunction} so the next `get` recomputes.
 */
export class DominatorTreeAnalysis extends FunctionAnalysis<DominatorTree> {
  run(functionIR: FunctionIR, _AM: AnalysisManager): DominatorTree {
    return DominatorTree.compute(functionIR);
  }
}
