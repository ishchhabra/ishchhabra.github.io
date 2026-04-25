import { getDominanceFrontier, getDominators, getImmediateDominators } from "../../frontend/cfg";
import type { BlockId } from "../../ir";
import type { FuncOp } from "../../ir/core/FuncOp";
import { AnalysisManager, FunctionAnalysis } from "./AnalysisManager";

/**
 * Dominance information for a function's CFG, analogous to LLVM's
 * `llvm::DominatorTree`. Loop structure and back edges live in {@link LoopInfo}.
 *
 * Reads predecessors directly from each block's intrusive use-list —
 * no separate CFG analysis. Obtain via {@link AnalysisManager#get}
 * with {@link DominatorTreeAnalysis}; tests may call
 * {@link DominatorTree.compute}(funcOp) directly.
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
   * Builds a dominator tree from a function. Predecessors are read
   * directly from each block's CFG use-list, which is always current —
   * no separate CFG analysis needed.
   */
  static compute(funcOp: FuncOp): DominatorTree {
    const entry = funcOp.entryBlock.id;
    const predecessors = new Map<BlockId, Set<BlockId>>();
    for (const block of funcOp.blocks) {
      const preds = new Set<BlockId>();
      for (const pred of block.predecessors()) preds.add(pred.id);
      predecessors.set(block.id, preds);
    }
    const dominators = getDominators(predecessors, entry);
    const immediateDominators = getImmediateDominators(dominators);
    const dominanceFrontier = getDominanceFrontier(predecessors, immediateDominators);

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
 * After structural CFG edits, {@link AnalysisManager#invalidateFunction}
 * so the next `get` recomputes. Predecessors are always live (via the
 * block use-list); this analysis caches dominance, not the CFG itself.
 */
export class DominatorTreeAnalysis extends FunctionAnalysis<DominatorTree> {
  run(funcOp: FuncOp): DominatorTree {
    return DominatorTree.compute(funcOp);
  }
}
