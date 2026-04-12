import type { BlockId } from "../../ir";
import { getBackEdgesWithDominance } from "../../frontend/cfg";
import type { FunctionIR } from "../../ir/core/FunctionIR";
import { AnalysisManager, FunctionAnalysis } from "./AnalysisManager";
import type { ControlFlowGraph } from "./ControlFlowGraphAnalysis";
import { ControlFlowGraphAnalysis } from "./ControlFlowGraphAnalysis";
import type { DominatorTree } from "./DominatorTreeAnalysis";
import { DominatorTreeAnalysis } from "./DominatorTreeAnalysis";

/**
 * A natural loop: single header, body blocks, nesting, and back edges into the header.
 */
export class Loop {
  /** Child loops nested immediately inside this loop (see {@link LoopInfo.compute}). */
  readonly subLoops: Loop[] = [];

  constructor(
    readonly header: BlockId,
    /** Blocks in this loop (including the header). */
    readonly blocks: ReadonlySet<BlockId>,
    readonly parent: Loop | null,
    private readonly backEdgePreds: ReadonlySet<BlockId>,
  ) {}

  /** Predecessors of {@link header} that are loop back edges into the header. */
  getBackEdgePredecessors(): ReadonlySet<BlockId> {
    return this.backEdgePreds;
  }
}

/**
 * Per-function loop nest (LLVM: `LoopInfo`): natural loops, nesting, and
 * back-edge classification for loop headers.
 *
 * Depends on {@link DominatorTree} and {@link ControlFlowGraph} (predecessor map).
 */
interface RawNaturalLoop {
  header: BlockId;
  blocks: Set<BlockId>;
  latches: Set<BlockId>;
}

export class LoopInfo {
  constructor(
    private readonly topLevel: readonly Loop[],
    private readonly innermost: ReadonlyMap<BlockId, Loop>,
    private readonly backEdgeIntoHeader: ReadonlyMap<BlockId, ReadonlySet<BlockId>>,
  ) {}

  getTopLevelLoops(): readonly Loop[] {
    return this.topLevel;
  }

  /** Innermost loop containing `block`, if any. */
  getLoopFor(block: BlockId): Loop | undefined {
    return this.innermost.get(block);
  }

  /**
   * Predecessors of `header` that are back edges into `header`
   * (empty if `header` is not a loop header or has no retreating edges).
   */
  getBackEdgePredecessors(header: BlockId): ReadonlySet<BlockId> {
    return this.backEdgeIntoHeader.get(header) ?? new Set();
  }

  static compute(functionIR: FunctionIR, dom: DominatorTree, cfg: ControlFlowGraph): LoopInfo {
    const predecessors = cfg.predecessors;
    const backEdgeMap = getBackEdgesWithDominance(functionIR.blocks, predecessors, (b) =>
      dom.getDominators(b),
    );

    const headersWithBackEdges = [...functionIR.blocks.keys()].filter(
      (h) => (backEdgeMap.get(h)?.size ?? 0) > 0,
    );

    if (headersWithBackEdges.length === 0) {
      return new LoopInfo([], new Map(), new Map());
    }

    const raws: RawNaturalLoop[] = [];
    for (const header of headersWithBackEdges) {
      const latches = backEdgeMap.get(header)!;
      const body = new Set<BlockId>();
      for (const latch of latches) {
        for (const b of naturalLoopBlocks(header, latch, predecessors)) {
          body.add(b);
        }
      }
      raws.push({ header, blocks: body, latches: new Set(latches) });
    }

    const parentOf = new Map<RawNaturalLoop, RawNaturalLoop | null>();
    const sortedBySize = [...raws].sort((a, b) => a.blocks.size - b.blocks.size);
    for (const raw of sortedBySize) {
      parentOf.set(raw, minimalProperSupersetRaw(raw, raws.filter((o) => o !== raw)));
    }

    const topLevelRaws = raws.filter((r) => parentOf.get(r) === null);

    const rawToLoop = new Map<RawNaturalLoop, Loop>();

    function buildLoop(raw: RawNaturalLoop, parent: Loop | null): Loop {
      const loop = new Loop(raw.header, raw.blocks, parent, raw.latches);
      rawToLoop.set(raw, loop);
      const childRaws = raws.filter((o) => parentOf.get(o) === raw);
      for (const c of childRaws) {
        loop.subLoops.push(buildLoop(c, loop));
      }
      return loop;
    }

    const topLevel = topLevelRaws.map((r) => buildLoop(r, null));

    const innermost = new Map<BlockId, Loop>();
    for (const blockId of functionIR.blocks.keys()) {
      const containing = raws.filter((r) => r.blocks.has(blockId));
      if (containing.length === 0) continue;
      const smallest = containing.reduce((a, b) => (a.blocks.size <= b.blocks.size ? a : b));
      innermost.set(blockId, rawToLoop.get(smallest)!);
    }

    const beReadonly = new Map<BlockId, ReadonlySet<BlockId>>();
    for (const [h, set] of backEdgeMap) {
      beReadonly.set(h, set);
    }

    return new LoopInfo(topLevel, innermost, beReadonly);
  }
}

function strictSubset(a: Set<BlockId>, b: Set<BlockId>): boolean {
  if (a.size >= b.size) return false;
  for (const x of a) {
    if (!b.has(x)) return false;
  }
  return true;
}

function minimalProperSupersetRaw(
  inner: RawNaturalLoop,
  candidates: RawNaturalLoop[],
): RawNaturalLoop | null {
  const supersets = candidates.filter((o) => strictSubset(inner.blocks, o.blocks));
  if (supersets.length === 0) return null;
  return supersets.reduce((best, o) => (o.blocks.size < best.blocks.size ? o : best));
}

/**
 * Natural loop for a back edge latch → header (header dominates latch).
 */
function naturalLoopBlocks(
  header: BlockId,
  latch: BlockId,
  predecessors: ReadonlyMap<BlockId, Set<BlockId>>,
): Set<BlockId> {
  const loop = new Set<BlockId>([header]);
  const stack = [latch];
  while (stack.length > 0) {
    const b = stack.pop()!;
    if (loop.has(b)) continue;
    loop.add(b);
    for (const p of predecessors.get(b) ?? []) {
      if (!loop.has(p)) {
        loop.add(p);
        if (p !== header) {
          stack.push(p);
        }
      }
    }
  }
  return loop;
}

/**
 * Cached {@link LoopInfo} for a function (LLVM-style loop analysis).
 *
 * Depends on {@link DominatorTreeAnalysis} and {@link ControlFlowGraphAnalysis}.
 * Invalidate when the CFG changes.
 */
export class LoopInfoAnalysis extends FunctionAnalysis<LoopInfo> {
  run(functionIR: FunctionIR, AM: AnalysisManager): LoopInfo {
    const cfg = AM.get(ControlFlowGraphAnalysis, functionIR);
    const dom = AM.get(DominatorTreeAnalysis, functionIR);
    return LoopInfo.compute(functionIR, dom, cfg);
  }
}
