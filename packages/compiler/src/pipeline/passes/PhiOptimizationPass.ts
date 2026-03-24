import { Environment } from "../../environment";
import { BaseInstruction, BlockId, StoreLocalInstruction } from "../../ir";
import { Place } from "../../ir/core/Place";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { BranchTerminal, JumpTerminal } from "../../ir/core/Terminal";
import { TernaryStructure } from "../../ir/core/Structure";
import { BaseOptimizationPass, OptimizationResult } from "../late-optimizer/OptimizationPass";
import { Phi } from "../ssa/Phi";

/**
 * SSA-phase phi optimization pass (analogous to GCC's pass_phiopt).
 *
 * Detects diamond-shaped CFG patterns where a phi node merges values
 * from two branches, and converts them into a TernaryStructure.
 *
 * Supports nested diamonds: when one arm of the outer diamond contains
 * an already-collapsed TernaryStructure, the pass looks through the
 * structure's fallthrough trampoline to detect the outer diamond.
 */
export class PhiOptimizationPass extends BaseOptimizationPass {
  constructor(
    protected readonly functionIR: FunctionIR,
    private readonly phis: Set<Phi>,
    private readonly environment: Environment,
  ) {
    super(functionIR);
  }

  protected step(): OptimizationResult {
    let changed = false;

    for (const phi of this.phis) {
      if (this.tryCollapseDiamond(phi)) {
        changed = true;
        break;
      }
    }

    return { changed };
  }

  private tryCollapseDiamond(phi: Phi): boolean {
    if (phi.operands.size !== 2) return false;

    const [operandB, operandC] = [...phi.operands.entries()];
    const [blockIdB, placeB] = operandB;
    const [blockIdC, placeC] = operandC;
    const mergeBlockId = phi.blockId;

    const blockB = this.functionIR.blocks.get(blockIdB);
    const blockC = this.functionIR.blocks.get(blockIdC);
    if (!blockB || !blockC) return false;

    // Both operand blocks must jump to the merge block.
    if (!(blockB.terminal instanceof JumpTerminal)) return false;
    if (!(blockC.terminal instanceof JumpTerminal)) return false;
    if (blockB.terminal.target !== mergeBlockId) return false;
    if (blockC.terminal.target !== mergeBlockId) return false;

    // Find the branch block (A) that dominates both operand blocks.
    // Use getEffectivePredecessor to look through structure fallthroughs.
    const branchBlockIdB = this.getEffectivePredecessor(blockIdB);
    const branchBlockIdC = this.getEffectivePredecessor(blockIdC);
    if (branchBlockIdB === null || branchBlockIdC === null) return false;
    if (branchBlockIdB !== branchBlockIdC) return false;

    const branchBlockId = branchBlockIdB;
    const branchBlock = this.functionIR.blocks.get(branchBlockId);
    if (!branchBlock) return false;

    const terminal = branchBlock.terminal;
    if (!(terminal instanceof BranchTerminal)) return false;
    if (terminal.fallthrough !== mergeBlockId) return false;

    // Determine which operand is consequent and which is alternate.
    // matchBranchTarget handles the case where a phi operand block is
    // the fallthrough of a TernaryStructure on the branch target.
    let consBlockId: BlockId, altBlockId: BlockId;
    let consOperandPlace: Place, altOperandPlace: Place;

    if (
      this.matchBranchTarget(blockIdB, terminal.consequent) &&
      this.matchBranchTarget(blockIdC, terminal.alternate)
    ) {
      consBlockId = terminal.consequent;
      altBlockId = terminal.alternate;
      consOperandPlace = placeB;
      altOperandPlace = placeC;
    } else if (
      this.matchBranchTarget(blockIdC, terminal.consequent) &&
      this.matchBranchTarget(blockIdB, terminal.alternate)
    ) {
      consBlockId = terminal.consequent;
      altBlockId = terminal.alternate;
      consOperandPlace = placeC;
      altOperandPlace = placeB;
    } else {
      return false;
    }

    const consBlock = this.functionIR.blocks.get(consBlockId)!;
    const altBlock = this.functionIR.blocks.get(altBlockId)!;

    // Extract the phi store from each branch.
    // For structure-through arms, the phi operand block is the structure's
    // fallthrough (a trampoline), not the branch target. Use the operand
    // place directly in that case.
    const consResult = this.extractArmValue(consBlock, consBlockId, blockIdB, phi, consOperandPlace);
    const altResult = this.extractArmValue(altBlock, altBlockId, blockIdC, phi, altOperandPlace);
    if (!consResult || !altResult) return false;

    // === Apply the transformation ===

    consBlock.instructions = consResult.remainingInstrs;
    altBlock.instructions = altResult.remainingInstrs;

    // Clear arm block terminals — they're owned by the structure now.
    consBlock.terminal = undefined;
    altBlock.terminal = undefined;

    // If an arm traces through a structure fallthrough trampoline (G),
    // clear its terminal too so the inner structure's codegen doesn't
    // follow it into the outer merge block.
    for (const trampoline of consResult.trampolines) {
      const block = this.functionIR.blocks.get(trampoline);
      if (block) block.terminal = undefined;
    }
    for (const trampoline of altResult.trampolines) {
      const block = this.functionIR.blocks.get(trampoline);
      if (block) block.terminal = undefined;
    }

    const resultPlace = this.environment.createPlace(this.environment.createIdentifier());

    const ternary = new TernaryStructure(
      branchBlockId,
      terminal.test,
      consBlockId,
      consResult.valuePlace,
      altBlockId,
      altResult.valuePlace,
      mergeBlockId,
      resultPlace,
    );
    this.functionIR.structures.set(branchBlockId, ternary);

    branchBlock.terminal = new JumpTerminal(terminal.id, mergeBlockId);

    // Rewrite all references to the phi's place → the ternary result.
    const rewriteMap = new Map([[phi.place.identifier, resultPlace]]);
    for (const block of this.functionIR.blocks.values()) {
      for (let i = 0; i < block.instructions.length; i++) {
        const rewritten = block.instructions[i].rewrite(rewriteMap);
        if (rewritten !== block.instructions[i]) {
          block.instructions[i] = rewritten;
        }
      }
      if (block.terminal) {
        const rewrittenTerminal = block.terminal.rewrite(rewriteMap);
        if (rewrittenTerminal !== block.terminal) {
          block.terminal = rewrittenTerminal;
        }
      }
    }

    for (const otherPhi of this.phis) {
      for (const [blockId, operandPlace] of otherPhi.operands) {
        if (operandPlace.identifier.id === phi.place.identifier.id) {
          otherPhi.operands.set(blockId, resultPlace);
        }
      }
    }

    this.phis.delete(phi);
    this.functionIR.recomputeCFG();
    return true;
  }

  /**
   * Follows predecessor chain through TernaryStructure fallthroughs.
   * When a block's sole predecessor has a TernaryStructure whose
   * fallthrough is this block, the "effective" predecessor is the
   * structure header's predecessor (the actual branch block).
   */
  private getEffectivePredecessor(blockId: BlockId): BlockId | null {
    const preds = this.functionIR.predecessors.get(blockId);
    if (!preds || preds.size !== 1) return null;
    const pred = [...preds][0];

    const structure = this.functionIR.structures.get(pred);
    if (structure instanceof TernaryStructure && structure.fallthrough === blockId) {
      return this.getEffectivePredecessor(pred);
    }

    return pred;
  }

  /**
   * Checks if a phi operand block matches a branch terminal target,
   * either directly or through a TernaryStructure fallthrough chain.
   */
  private matchBranchTarget(phiBlockId: BlockId, branchTarget: BlockId): boolean {
    if (phiBlockId === branchTarget) return true;

    const structure = this.functionIR.structures.get(branchTarget);
    if (structure instanceof TernaryStructure) {
      return this.matchBranchTarget(phiBlockId, structure.fallthrough);
    }
    return false;
  }

  /**
   * Extracts the arm value for creating the ternary structure.
   *
   * Direct case: armBlockId === phiBlockId. Extract the phi store from
   * the arm block normally.
   *
   * Structure-through case: phiBlockId is the fallthrough of a structure
   * on armBlockId. Use the phi operand place directly (it's the inner
   * structure's result). Return the trampoline block IDs so their
   * terminals can be cleared.
   */
  private extractArmValue(
    armBlock: { instructions: BaseInstruction[] },
    armBlockId: BlockId,
    phiBlockId: BlockId,
    phi: Phi,
    operandPlace: Place,
  ): { valuePlace: Place; remainingInstrs: BaseInstruction[]; trampolines: BlockId[] } | null {
    if (armBlockId === phiBlockId) {
      // Direct case — extract phi store normally.
      const result = this.extractPhiStore(armBlock, phi, operandPlace);
      if (!result) return null;
      return { ...result, trampolines: [] };
    }

    // Structure-through case — the arm has an inner TernaryStructure
    // and the phi operand comes from its fallthrough trampoline.
    // Extract the outer phi's StoreLocal from the trampoline block
    // (that's where SSA placed it), then use the stored value.
    const trampolines = this.collectTrampolines(armBlockId, phiBlockId);
    if (trampolines === null) return null;

    const phiBlock = this.functionIR.blocks.get(phiBlockId);
    if (!phiBlock) return null;

    const phiStoreResult = this.extractPhiStore(phiBlock, phi, operandPlace);
    if (!phiStoreResult) return null;

    // Update the trampoline block's instructions (phi store removed).
    phiBlock.instructions = phiStoreResult.remainingInstrs;

    return {
      valuePlace: phiStoreResult.valuePlace,
      remainingInstrs: [...armBlock.instructions],
      trampolines,
    };
  }

  /**
   * Collects the chain of trampoline block IDs between a structure
   * header and the phi operand block (via fallthrough chain).
   */
  private collectTrampolines(fromBlockId: BlockId, toBlockId: BlockId): BlockId[] | null {
    const structure = this.functionIR.structures.get(fromBlockId);
    if (!(structure instanceof TernaryStructure)) return null;

    if (structure.fallthrough === toBlockId) {
      return [toBlockId];
    }

    const deeper = this.collectTrampolines(structure.fallthrough, toBlockId);
    if (deeper === null) return null;
    return [structure.fallthrough, ...deeper];
  }

  private extractPhiStore(
    block: { instructions: BaseInstruction[] },
    phi: Phi,
    operandPlace: Place,
  ): { valuePlace: Place; remainingInstrs: BaseInstruction[] } | null {
    let storeIndex = -1;

    for (let i = block.instructions.length - 1; i >= 0; i--) {
      const instr = block.instructions[i];
      if (
        instr instanceof StoreLocalInstruction &&
        instr.lval.identifier.declarationId === phi.declarationId
      ) {
        storeIndex = i;
        break;
      }
    }

    if (storeIndex !== -1) {
      const store = block.instructions[storeIndex] as StoreLocalInstruction;
      if (store.lval.identifier.id !== operandPlace.identifier.id) return null;

      const remainingInstrs = [
        ...block.instructions.slice(0, storeIndex),
        ...block.instructions.slice(storeIndex + 1),
      ];
      return { valuePlace: store.value, remainingInstrs };
    }

    return { valuePlace: operandPlace, remainingInstrs: [...block.instructions] };
  }
}
