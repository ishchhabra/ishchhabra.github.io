import { BlockId } from "../ir";
import { FunctionIR } from "../ir/core/FunctionIR";
import { ModuleIR } from "../ir/core/ModuleIR";
import { JumpTerminal } from "../ir/core/Terminal";
import { AnalysisManager } from "./analysis/AnalysisManager";
import {
  type ControlFlowGraph,
  ControlFlowGraphAnalysis,
} from "./analysis/ControlFlowGraphAnalysis";
import { BaseOptimizationPass, OptimizationResult } from "./late-optimizer/OptimizationPass";
import type { Phi } from "./ssa/Phi";

/**
 * Textbook CFG simplification pass.
 *
 * Performs three transforms in a fixpoint loop until no more changes:
 *
 *   1. **Unreachable block removal** — delete blocks with no path from entry.
 *   2. **Linear chain merging** — when a block has exactly one predecessor
 *      and that predecessor has exactly one successor, merge them.
 *   3. **Empty block elimination** — redirect predecessors around blocks that
 *      contain no instructions and just jump unconditionally.
 *
 * These transforms feed each other: removing an unreachable block may create
 * a linear chain; merging a chain may produce an empty block; eliminating an
 * empty block may make another block unreachable.
 *
 * When an optional `phis` set is provided (SSA context), phi operands are
 * updated to reflect block deletions and merges.
 */
export class CFGSimplificationPass extends BaseOptimizationPass {
  constructor(
    protected readonly functionIR: FunctionIR,
    private readonly moduleIR: ModuleIR,
    private readonly AM: AnalysisManager,
  ) {
    super(functionIR);
  }

  private get phis(): Set<Phi> {
    return this.functionIR.phis;
  }

  protected step(): OptimizationResult {
    const cfg = this.AM.get(ControlFlowGraphAnalysis, this.functionIR);
    let changed = false;
    changed = this.removeUnreachableBlocks(cfg) || changed;
    changed = this.mergeLinearChains(cfg) || changed;
    // TODO: enable eliminateEmptyBlocks once the code generator no longer
    // relies on the existence of empty fallthrough blocks. The implementation
    // is correct but the code generator expects certain blocks to exist for
    // structural code emission (e.g. if-else merge points).
    if (changed) {
      this.AM.invalidateFunction(this.functionIR);
    }
    return { changed };
  }

  // ---------------------------------------------------------------------------
  // Transform 1: Unreachable block removal
  // ---------------------------------------------------------------------------

  /**
   * Remove blocks not reachable from entry.
   *
   * A block is deleted only if no reachable block's terminal or structure
   * still references it. Otherwise we clear its instructions (the block
   * remains as an empty target so the code generator doesn't crash).
   */
  private removeUnreachableBlocks(cfg: ControlFlowGraph): boolean {
    const reachable = new Set<BlockId>();
    const worklist: BlockId[] = [this.functionIR.entryBlockId];

    while (worklist.length > 0) {
      const blockId = worklist.pop()!;
      if (reachable.has(blockId)) continue;
      reachable.add(blockId);

      const succs = cfg.successors.get(blockId);
      if (succs) {
        for (const succ of succs) {
          worklist.push(succ);
        }
      }
    }

    // Collect all block IDs still referenced by reachable blocks'
    // terminals and structures (includes fallthrough targets that
    // getPredecessors does not treat as successors).
    const referenced = new Set<BlockId>();
    for (const blockId of reachable) {
      const block = this.functionIR.blocks.get(blockId);
      if (!block) continue;
      if (block.terminal) {
        for (const ref of block.terminal.getBlockRefs()) {
          referenced.add(ref);
        }
      }
      const structure = this.functionIR.structures.get(blockId);
      if (structure) {
        for (const ref of structure.getBlockRefs()) {
          referenced.add(ref);
        }
      }
    }

    let changed = false;
    for (const [blockId, block] of this.functionIR.blocks) {
      if (reachable.has(blockId)) continue;

      if (referenced.has(blockId)) {
        // Still referenced — clear instructions but keep the block.
        if (block.instructions.length > 0) {
          block.clearInstructions();
          changed = true;
        }
      } else {
        // Truly orphaned — safe to delete.
        this.deleteBlock(blockId);
        changed = true;
      }
    }
    return changed;
  }

  // ---------------------------------------------------------------------------
  // Transform 2: Linear chain merging
  // ---------------------------------------------------------------------------

  /**
   * Merge successor into predecessor when the edge is the only one for both.
   */
  private mergeLinearChains(cfg: ControlFlowGraph): boolean {
    let changed = false;

    for (const blockId of Array.from(this.functionIR.blocks.keys())) {
      if (!this.functionIR.blocks.has(blockId)) continue;

      const preds = cfg.predecessors.get(blockId);
      if (!preds || preds.size !== 1) continue;

      const [predId] = preds;
      if (!this.functionIR.blocks.has(predId)) continue;

      const predSuccs = cfg.successors.get(predId);
      if (!predSuccs || predSuccs.size !== 1) continue;

      // Don't merge structural join points (fallthrough targets). These
      // blocks mark where control reconverges after a branch/switch/try,
      // and codegen relies on them existing as distinct blocks.
      if (this.isJoinTarget(blockId)) continue;

      // Don't merge blocks referenced by structures (e.g. loop bodies,
      // ternary arms).
      if (this.isReferencedByStructure(blockId)) continue;

      // Structure-owning header blocks are not ordinary CFG blocks: codegen
      // reconstructs source syntax from the structure attached to that exact
      // block ID. Merging either direction would move executable instructions
      // across the structure boundary and change semantics (for example,
      // sinking pre-block declarations into a lexical block header or loop
      // preheader work into the loop body).
      if (this.functionIR.structures.has(blockId)) continue;
      if (this.functionIR.structures.has(predId)) continue;

      const predBlock = this.functionIR.blocks.get(predId)!;
      const block = this.functionIR.blocks.get(blockId)!;

      // Don't merge blocks with different scope IDs — the scope boundary
      // represents a source-level { } block that the codegen must emit.
      if (predBlock.scopeId !== block.scopeId) continue;

      // Absorb instructions and terminal. Instructions are moved (not
      // created/deleted), so use-chains stay valid without re-registration.
      // Terminal must be detached from `block` first (unregisters), then
      // attached to `predBlock` (re-registers) — block-agnostic use-chains
      // end up with the terminal registered exactly once.
      predBlock.instructions.push(...block.instructions);
      const movedTerminal = block.terminal;
      block.terminal = undefined;
      predBlock.terminal = movedTerminal;

      // Re-home declToPlaces references.
      for (const [, places] of this.moduleIR.environment.declToPlaces) {
        for (const entry of places) {
          if (entry.blockId === blockId) {
            entry.blockId = predId;
          }
        }
      }

      // Re-key phi operands: blockId → predId.
      this.rekeyPhiOperands(blockId, predId);

      // Remap all references to the deleted block.
      this.remapBlockReferences(blockId, predId);

      this.functionIR.blocks.delete(blockId);
      changed = true;
    }
    return changed;
  }

  // ---------------------------------------------------------------------------
  // Transform 3: Empty block elimination
  // ---------------------------------------------------------------------------

  /**
   * Redirect all references around empty blocks that just unconditionally jump.
   *
   * An empty trampoline block B (no instructions, Jump terminal, not entry,
   * no structure, no phis) jumping to target T can be bypassed: every block
   * whose terminal references B is retargeted to T directly.
   *
   * Unlike mergeLinearChains, this handles the case where B has multiple
   * predecessors or is referenced by terminals that don't create CFG
   * predecessor edges (e.g. BranchTerminal.fallthrough).
   */
  private eliminateEmptyBlocks(cfg: ControlFlowGraph): boolean {
    let changed = false;

    for (const [blockId, block] of this.functionIR.blocks) {
      // Must be an empty unconditional jump.
      if (blockId === this.functionIR.entryBlockId) continue;
      if (block.instructions.length !== 0) continue;
      if (!(block.terminal instanceof JumpTerminal)) continue;
      if (this.functionIR.structures.has(blockId)) continue;
      if (this.blockHasPhis(blockId)) continue;
      if (this.isReferencedByStructure(blockId)) continue;

      const target = block.terminal.target;
      if (target === blockId) continue; // self-loop

      // Collect CFG predecessors for phi migration.
      const preds = cfg.predecessors.get(blockId);

      // Abort if retargeting would create duplicate predecessors at the target.
      if (preds && preds.size > 0) {
        const targetPreds = cfg.predecessors.get(target);
        if (targetPreds && [...preds].some((p) => p !== blockId && targetPreds.has(p))) {
          continue;
        }
      }

      // Remap all references from the deleted block to its target.
      this.remapBlockReferences(blockId, target);

      // Migrate phi operands: any phi that references blockId now
      // references each of blockId's CFG predecessors with the same value.
      if (preds) {
        for (const phi of this.phis) {
          const operand = phi.operands.get(blockId);
          if (operand !== undefined) {
            phi.operands.delete(blockId);
            for (const predId of preds) {
              if (predId !== blockId) {
                phi.operands.set(predId, operand);
              }
            }
          }
        }
      }

      this.deleteBlock(blockId);
      changed = true;
    }
    return changed;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Remap every terminal and structure reference from `from` to `to`.
   * Standard step 2 of CFG block merging — after absorbing a block's
   * contents, all dangling references must be updated.
   */
  private remapBlockReferences(from: BlockId, to: BlockId): void {
    for (const [otherId, otherBlock] of this.functionIR.blocks) {
      if (otherId === from || otherId === to) continue;
      otherBlock.terminal?.remap(from, to);
    }
    for (const [structId, structure] of this.functionIR.structures) {
      if (structId === from) continue;
      structure.remap(from, to);
    }
    // Remap block labels so the backend can still find them.
    const label = this.functionIR.blockLabels.get(from);
    if (label !== undefined) {
      this.functionIR.blockLabels.delete(from);
      this.functionIR.blockLabels.set(to, label);
    }
  }

  private deleteBlock(blockId: BlockId): void {
    // Remove phi operands that reference this block.
    for (const phi of this.phis) {
      const result = phi.removeOperand(blockId);
      if (result === "empty") {
        this.phis.delete(phi);
      }
    }

    this.functionIR.blocks.delete(blockId);
    this.functionIR.deleteStructure(blockId);
    this.functionIR.blockLabels.delete(blockId);
  }

  private rekeyPhiOperands(fromBlockId: BlockId, toBlockId: BlockId): void {
    for (const phi of this.phis) {
      const operand = phi.operands.get(fromBlockId);
      if (operand !== undefined) {
        phi.operands.delete(fromBlockId);
        phi.operands.set(toBlockId, operand);
      }
    }
  }

  private isJoinTarget(blockId: BlockId): boolean {
    for (const [, block] of this.functionIR.blocks) {
      if (block.terminal?.getJoinTarget() === blockId) return true;
    }
    return false;
  }

  private isReferencedByStructure(blockId: BlockId): boolean {
    for (const [, structure] of this.functionIR.structures) {
      for (const ref of structure.getBlockRefs()) {
        if (ref === blockId) return true;
      }
    }
    return false;
  }

  private blockHasPhis(blockId: BlockId): boolean {
    for (const phi of this.phis) {
      if (phi.blockId === blockId) return true;
    }
    return false;
  }
}
