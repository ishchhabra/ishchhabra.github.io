import { BasicBlock } from "../core/Block";
import { FunctionIR } from "../core/FunctionIR";
import { FunctionAnalysis } from "./AnalysisManager";

/**
 * Dominance facts for one function control-flow graph.
 *
 * A block dominates another block when every executable path from the function
 * entry to the second block must pass through the first block.
 */
export class DominatorTree {
  private constructor(
    private readonly root: BasicBlock,
    private readonly dominators: ReadonlyMap<BasicBlock, ReadonlySet<BasicBlock>>,
    private readonly immediateDominators: ReadonlyMap<BasicBlock, BasicBlock | null>,
    private readonly frontiers: ReadonlyMap<BasicBlock, ReadonlySet<BasicBlock>>,
  ) {}

  /**
   * Entry block of the analyzed function.
   */
  public getRoot(): BasicBlock {
    return this.root;
  }

  /**
   * Returns whether `dominator` dominates `block`.
   */
  public dominates(dominator: BasicBlock, block: BasicBlock): boolean {
    return this.dominators.get(block)?.has(dominator) ?? false;
  }

  /**
   * Returns whether `dominator` dominates `block` and they are different blocks.
   */
  public properlyDominates(dominator: BasicBlock, block: BasicBlock): boolean {
    return dominator !== block && this.dominates(dominator, block);
  }

  /**
   * Returns all dominators of `block`, including `block` itself.
   */
  public getDominators(block: BasicBlock): ReadonlySet<BasicBlock> {
    return this.dominators.get(block) ?? new Set();
  }

  /**
   * Returns the immediate dominator of `block`.
   *
   * The entry block has no immediate dominator.
   */
  public getImmediateDominator(block: BasicBlock): BasicBlock | null {
    return this.immediateDominators.get(block) ?? null;
  }

  /**
   * Returns every block's immediate dominator.
   */
  public getImmediateDominators(): ReadonlyMap<BasicBlock, BasicBlock | null> {
    return this.immediateDominators;
  }

  /**
   * Returns the dominance frontier of `block`.
   *
   * SSA construction uses dominance frontiers to decide where block-parameter
   * phi equivalents are needed.
   */
  public getDominanceFrontier(block: BasicBlock): ReadonlySet<BasicBlock> {
    return this.frontiers.get(block) ?? new Set();
  }

  /**
   * Computes dominance over executable CFG successor edges.
   */
  public static compute(fn: FunctionIR): DominatorTree {
    const blocks = reachableBlocks(fn);
    const predecessors = computePredecessors(blocks);
    const dominators = computeDominators(fn.entryBlock, blocks, predecessors);
    const immediateDominators = computeImmediateDominators(fn.entryBlock, blocks, dominators);
    const frontiers = computeDominanceFrontiers(blocks, predecessors, immediateDominators);

    return new DominatorTree(fn.entryBlock, dominators, immediateDominators, frontiers);
  }
}

/**
 * Cached dominator-tree analysis for one function.
 */
export const DominatorTreeAnalysis = {
  name: "DominatorTree",

  run(fn: FunctionIR): DominatorTree {
    return DominatorTree.compute(fn);
  },
} satisfies FunctionAnalysis<DominatorTree>;

function reachableBlocks(fn: FunctionIR): readonly BasicBlock[] {
  const reachable: Set<BasicBlock> = new Set();
  const worklist = [fn.entryBlock];

  while (worklist.length > 0) {
    const block = worklist.pop();
    if (block === undefined || reachable.has(block)) continue;

    reachable.add(block);

    const terminator = block.terminator;
    if (terminator === null) continue;

    for (const index of terminator.successorIndices()) {
      worklist.push(terminator.target(index).block);
    }
  }

  return fn.blocks.filter((block) => reachable.has(block));
}

function computePredecessors(
  blocks: readonly BasicBlock[],
): ReadonlyMap<BasicBlock, ReadonlySet<BasicBlock>> {
  const blockSet = new Set(blocks);
  const predecessors: Map<BasicBlock, Set<BasicBlock>> = new Map();

  for (const block of blocks) {
    predecessors.set(block, new Set());
  }

  for (const block of blocks) {
    const terminator = block.terminator;
    if (terminator === null) continue;

    for (const index of terminator.successorIndices()) {
      const successor = terminator.target(index).block;
      if (blockSet.has(successor)) {
        predecessors.get(successor)!.add(block);
      }
    }
  }

  return predecessors;
}

function computeDominators(
  entry: BasicBlock,
  blocks: readonly BasicBlock[],
  predecessors: ReadonlyMap<BasicBlock, ReadonlySet<BasicBlock>>,
): ReadonlyMap<BasicBlock, ReadonlySet<BasicBlock>> {
  const allBlocks = new Set(blocks);
  const dominators: Map<BasicBlock, Set<BasicBlock>> = new Map();

  for (const block of blocks) {
    dominators.set(block, block === entry ? new Set([entry]) : new Set(allBlocks));
  }

  let changed = true;
  while (changed) {
    changed = false;

    for (const block of blocks) {
      if (block === entry) continue;

      const preds = [...(predecessors.get(block) ?? [])];
      const next = preds.length === 0 ? new Set<BasicBlock>() : new Set(dominators.get(preds[0]));

      for (const pred of preds.slice(1)) {
        for (const candidate of Array.from(next)) {
          if (!dominators.get(pred)!.has(candidate)) {
            next.delete(candidate);
          }
        }
      }

      next.add(block);

      if (!sameSet(dominators.get(block)!, next)) {
        dominators.set(block, next);
        changed = true;
      }
    }
  }

  return dominators;
}

function computeImmediateDominators(
  entry: BasicBlock,
  blocks: readonly BasicBlock[],
  dominators: ReadonlyMap<BasicBlock, ReadonlySet<BasicBlock>>,
): ReadonlyMap<BasicBlock, BasicBlock | null> {
  const immediateDominators: Map<BasicBlock, BasicBlock | null> = new Map();

  for (const block of blocks) {
    if (block === entry) {
      immediateDominators.set(block, null);
      continue;
    }

    const strictDominators = [...dominators.get(block)!].filter((candidate) => candidate !== block);
    const immediate = strictDominators.find((candidate) =>
      strictDominators.every(
        (other) => other === candidate || dominators.get(candidate)!.has(other),
      ),
    );

    immediateDominators.set(block, immediate ?? null);
  }

  return immediateDominators;
}

function computeDominanceFrontiers(
  blocks: readonly BasicBlock[],
  predecessors: ReadonlyMap<BasicBlock, ReadonlySet<BasicBlock>>,
  immediateDominators: ReadonlyMap<BasicBlock, BasicBlock | null>,
): ReadonlyMap<BasicBlock, ReadonlySet<BasicBlock>> {
  const frontiers = new Map<BasicBlock, Set<BasicBlock>>();

  for (const block of blocks) {
    frontiers.set(block, new Set());
  }

  for (const block of blocks) {
    const preds = [...(predecessors.get(block) ?? [])];
    if (preds.length < 2) continue;

    for (const pred of preds) {
      let runner: BasicBlock | null = pred;

      while (runner !== null && runner !== immediateDominators.get(block)) {
        frontiers.get(runner)!.add(block);
        runner = immediateDominators.get(runner) ?? null;
      }
    }
  }

  return frontiers;
}

function sameSet<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  if (left.size !== right.size) return false;

  for (const value of left) {
    if (!right.has(value)) return false;
  }

  return true;
}
