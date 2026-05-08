import type { BasicBlock } from "../core/Block";
import type { FunctionIR } from "../core/FunctionIR";
import type { BlockTarget, TerminatorOp } from "../core/TerminatorOp";
import type { AnalysisManager, FunctionAnalysis } from "./AnalysisManager";

/**
 * Executable CFG edge from one terminator successor slot to one successor block.
 *
 * `successorIndex` is the stable terminator edge index accepted by
 * `TerminatorOp.target(index)` and `TerminatorOp.withTarget(index, target)`.
 */
export interface CFGEdge {
  readonly predecessor: BasicBlock;
  readonly successor: BasicBlock;
  readonly successorIndex: number;
  readonly target: BlockTarget;
}

/**
 * Executable control-flow graph facts for one function.
 *
 * The CFG uses `TerminatorOp.successorIndices()`, so structural block
 * references that are not runtime successor edges are intentionally excluded.
 */
export class CFG {
  readonly #reachableSet: ReadonlySet<BasicBlock>;
  readonly #edgesInOrder: readonly CFGEdge[];

  constructor(
    private readonly entry: BasicBlock,
    private readonly reachableBlocksInOrder: readonly BasicBlock[],
    private readonly unreachableBlocksInOrder: readonly BasicBlock[],
    private readonly successorEdgesByBlock: ReadonlyMap<
      BasicBlock,
      readonly CFGEdge[]
    >,
    private readonly predecessorEdgesByBlock: ReadonlyMap<
      BasicBlock,
      readonly CFGEdge[]
    >,
  ) {
    this.#reachableSet = new Set(reachableBlocksInOrder);
    this.#edgesInOrder = reachableBlocksInOrder.flatMap((block) =>
      this.successorEdges(block),
    );
  }

  /**
   * Entry block of the function.
   */
  public entryBlock(): BasicBlock {
    return this.entry;
  }

  /**
   * Reachable blocks in function order.
   */
  public reachableBlocks(): readonly BasicBlock[] {
    return this.reachableBlocksInOrder;
  }

  /**
   * Function-owned blocks unreachable from entry.
   */
  public unreachableBlocks(): readonly BasicBlock[] {
    return this.unreachableBlocksInOrder;
  }

  /**
   * Returns whether a block is reachable from the function entry.
   */
  public isReachable(block: BasicBlock): boolean {
    return this.#reachableSet.has(block);
  }

  /**
   * Executable CFG edges in predecessor function order.
   */
  public edges(): readonly CFGEdge[] {
    return this.#edgesInOrder;
  }

  /**
   * Executable successor edges leaving a block.
   */
  public successorEdges(block: BasicBlock): readonly CFGEdge[] {
    return this.successorEdgesByBlock.get(block) ?? [];
  }

  /**
   * Executable predecessor edges entering a block.
   */
  public predecessorEdges(block: BasicBlock): readonly CFGEdge[] {
    return this.predecessorEdgesByBlock.get(block) ?? [];
  }

  /**
   * Runtime successor blocks for a block.
   */
  public successors(block: BasicBlock): readonly BasicBlock[] {
    return this.successorEdges(block).map((edge) => edge.successor);
  }

  /**
   * Runtime predecessor blocks for a block.
   */
  public predecessors(block: BasicBlock): readonly BasicBlock[] {
    return this.predecessorEdges(block).map((edge) => edge.predecessor);
  }

  /**
   * Looks up one executable successor edge by terminator successor index.
   */
  public successorEdge(block: BasicBlock, successorIndex: number): CFGEdge {
    const edge = this.successorEdges(block).find(
      (candidate) => candidate.successorIndex === successorIndex,
    );

    if (edge === undefined) {
      throw new Error(
        `Block bb${block.id} has no executable successor edge ${successorIndex}`,
      );
    }

    return edge;
  }

  /**
   * Returns whether an edge is critical.
   *
   * A critical edge leaves a block with multiple successors and enters a block
   * with multiple predecessors. Edge-local transforms usually split these edges.
   */
  public isCriticalEdge(edge: CFGEdge): boolean {
    return (
      this.successorEdges(edge.predecessor).length > 1 &&
      this.predecessorEdges(edge.successor).length > 1
    );
  }

  public static compute(fn: FunctionIR): CFG {
    const reachable = computeReachableBlocks(fn);
    const reachableSet = new Set(reachable);
    const unreachable = fn.blocks.filter((block) => !reachableSet.has(block));

    const successorEdges = new Map<BasicBlock, CFGEdge[]>();
    const predecessorEdges = new Map<BasicBlock, CFGEdge[]>();

    for (const block of reachable) {
      successorEdges.set(block, []);
      predecessorEdges.set(block, []);
    }

    for (const block of reachable) {
      const terminator = block.terminator;
      if (terminator === null) continue;

      for (const edge of executableEdges(block, terminator, reachableSet)) {
        successorEdges.get(edge.predecessor)!.push(edge);
        predecessorEdges.get(edge.successor)!.push(edge);
      }
    }

    return new CFG(
      fn.entryBlock,
      reachable,
      unreachable,
      successorEdges,
      predecessorEdges,
    );
  }
}

/**
 * Cached executable CFG analysis for one function.
 */
export const CFGAnalysis = {
  name: "CFG",

  run(fn: FunctionIR, _analyses: AnalysisManager): CFG {
    return CFG.compute(fn);
  },
} satisfies FunctionAnalysis<CFG>;

function computeReachableBlocks(fn: FunctionIR): readonly BasicBlock[] {
  const functionBlocks = new Set(fn.blocks);
  const reachable = new Set<BasicBlock>();
  const worklist = [fn.entryBlock];

  while (worklist.length > 0) {
    const block = worklist.pop();
    if (block === undefined || reachable.has(block)) continue;

    if (!functionBlocks.has(block)) {
      throw new Error(
        `CFG edge reaches block bb${block.id} outside Function#${fn.id}`,
      );
    }

    reachable.add(block);

    const terminator = block.terminator;
    if (terminator === null) continue;

    for (const index of terminator.successorIndices()) {
      worklist.push(terminator.target(index).block);
    }
  }

  return fn.blocks.filter((block) => reachable.has(block));
}

function executableEdges(
  predecessor: BasicBlock,
  terminator: TerminatorOp,
  reachable: ReadonlySet<BasicBlock>,
): readonly CFGEdge[] {
  const edges: CFGEdge[] = [];

  for (const successorIndex of terminator.successorIndices()) {
    const target = terminator.target(successorIndex);
    if (!reachable.has(target.block)) continue;

    edges.push({
      predecessor,
      successor: target.block,
      successorIndex,
      target,
    });
  }

  return edges;
}
