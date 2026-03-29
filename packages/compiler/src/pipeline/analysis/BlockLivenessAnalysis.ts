import { BlockId, DeclarationId } from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { AnalysisManager, FunctionAnalysis } from "./AnalysisManager";

/**
 * Block-level liveness result: LiveIn and LiveOut sets per block,
 * tracking variables by DeclarationId.
 */
export class BlockLivenessResult {
  constructor(
    private readonly liveIn: ReadonlyMap<BlockId, ReadonlySet<DeclarationId>>,
    private readonly liveOut: ReadonlyMap<BlockId, ReadonlySet<DeclarationId>>,
  ) {}

  getLiveIn(blockId: BlockId): ReadonlySet<DeclarationId> {
    return this.liveIn.get(blockId) ?? EMPTY_SET;
  }

  getLiveOut(blockId: BlockId): ReadonlySet<DeclarationId> {
    return this.liveOut.get(blockId) ?? EMPTY_SET;
  }
}

const EMPTY_SET: ReadonlySet<DeclarationId> = new Set();

/**
 * Textbook backward dataflow liveness analysis.
 *
 * Computes per-block LiveIn and LiveOut sets tracking which
 * DeclarationIds (JavaScript variables) are live at block boundaries.
 *
 *   USE[B] = DeclarationIds read (via LoadLocal) before being written in B
 *   DEF[B] = DeclarationIds written (via StoreLocal/Copy lval) in B
 *
 *   LiveOut[B] = ∪ LiveIn[S] for each successor S of B
 *   LiveIn[B]  = USE[B] ∪ (LiveOut[B] - DEF[B])
 *
 * Iterates in postorder (efficient for backward dataflow on reducible
 * CFGs) until fixpoint.
 */
export class BlockLivenessAnalysis extends FunctionAnalysis<BlockLivenessResult> {
  run(functionIR: FunctionIR, _AM: AnalysisManager): BlockLivenessResult {
    // Step 1: Compute USE and DEF per block.
    const use = new Map<BlockId, Set<DeclarationId>>();
    const def = new Map<BlockId, Set<DeclarationId>>();

    for (const [blockId, block] of functionIR.blocks) {
      const blockUse = new Set<DeclarationId>();
      const blockDef = new Set<DeclarationId>();

      // Walk forward: a variable is USE'd if read before being DEF'd.
      for (const instr of block.instructions) {
        // Collect written places to exclude from reads.
        // For `x = y` (CopyInstruction), x is in both getReadPlaces and
        // getWrittenPlaces — but for liveness, x is a DEF, not a USE.
        const writtenDeclIds = new Set<DeclarationId>();
        for (const place of instr.getWrittenPlaces()) {
          writtenDeclIds.add(place.identifier.declarationId);
        }

        // Track reads that are not also writes.
        for (const place of instr.getReadPlaces()) {
          const declId = place.identifier.declarationId;
          if (!writtenDeclIds.has(declId) && !blockDef.has(declId)) {
            blockUse.add(declId);
          }
        }

        // Definitions.
        for (const declId of writtenDeclIds) {
          blockDef.add(declId);
        }
      }

      // Terminal reads.
      if (block.terminal) {
        for (const place of block.terminal.getReadPlaces()) {
          const declId = place.identifier.declarationId;
          if (!blockDef.has(declId)) {
            blockUse.add(declId);
          }
        }
      }

      use.set(blockId, blockUse);
      def.set(blockId, blockDef);
    }

    // Step 2: Compute postorder via DFS.
    const postorder = computePostorder(functionIR);

    // Step 3: Backward dataflow fixpoint.
    const liveIn = new Map<BlockId, Set<DeclarationId>>();
    const liveOut = new Map<BlockId, Set<DeclarationId>>();

    for (const blockId of functionIR.blocks.keys()) {
      liveIn.set(blockId, new Set());
      liveOut.set(blockId, new Set());
    }

    let changed = true;
    while (changed) {
      changed = false;

      // Iterate in postorder (efficient for backward dataflow).
      for (const blockId of postorder) {
        // LiveOut[B] = ∪ LiveIn[S] for each successor S.
        const succs = functionIR.successors.get(blockId);
        if (succs) {
          const out = liveOut.get(blockId)!;
          for (const succId of succs) {
            const succIn = liveIn.get(succId)!;
            for (const declId of succIn) {
              if (!out.has(declId)) {
                out.add(declId);
                changed = true;
              }
            }
          }
        }

        // LiveIn[B] = USE[B] ∪ (LiveOut[B] - DEF[B])
        const blockUse = use.get(blockId)!;
        const blockDef = def.get(blockId)!;
        const out = liveOut.get(blockId)!;
        const newIn = new Set(blockUse);
        for (const declId of out) {
          if (!blockDef.has(declId)) {
            newIn.add(declId);
          }
        }

        const oldIn = liveIn.get(blockId)!;
        if (newIn.size !== oldIn.size || [...newIn].some((d) => !oldIn.has(d))) {
          liveIn.set(blockId, newIn);
          changed = true;
        }
      }
    }

    return new BlockLivenessResult(liveIn, liveOut);
  }
}

/**
 * Compute postorder of the CFG via DFS from the entry block.
 * For backward dataflow, iterating in postorder is efficient because
 * successors are processed before predecessors.
 */
function computePostorder(functionIR: FunctionIR): BlockId[] {
  const visited = new Set<BlockId>();
  const order: BlockId[] = [];

  function dfs(blockId: BlockId): void {
    if (visited.has(blockId)) return;
    visited.add(blockId);

    const succs = functionIR.successors.get(blockId);
    if (succs) {
      for (const succId of succs) {
        dfs(succId);
      }
    }

    order.push(blockId);
  }

  dfs(functionIR.entryBlockId);
  return order;
}
