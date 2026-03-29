import {
  BasicBlock,
  CopyInstruction,
  DeclarationId,
  ExpressionStatementInstruction,
  LiteralInstruction,
  LoadLocalInstruction,
  LoadPhiInstruction,
  StoreLocalInstruction,
} from "../../../ir";
import { BaseInstruction } from "../../../ir/base";
import { Environment } from "../../../environment";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { Place } from "../../../ir/core/Place";
import { AnalysisManager } from "../../analysis/AnalysisManager";
import {
  BlockLivenessAnalysis,
  BlockLivenessResult,
} from "../../analysis/BlockLivenessAnalysis";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";

/**
 * Boissinot's interference-based copy coalescing.
 *
 * Uses block-level liveness analysis to determine whether two variables
 * interfere (have overlapping live ranges). A copy `dst = src` can be
 * eliminated when `dst` and `src` don't interfere — the intermediate
 * variable is unnecessary and the copy's source can be read directly.
 *
 * Two coalescing patterns:
 *
 *   1. **Declaration coalescing**: merges `let x = undefined; ... x = val`
 *      into `let x = val` when `x` is not read between the two.
 *
 *   2. **Interference-based intermediate elimination**: when a single-use
 *      const temporary feeds a Copy, and the temporary's source variable
 *      does not interfere with the Copy's destination, the Copy is
 *      rewritten to read the source directly. DCE removes the dead temp.
 */
export class LateCopyCoalescingPass extends BaseOptimizationPass {
  constructor(
    protected readonly functionIR: FunctionIR,
    private readonly environment: Environment,
    private readonly AM: AnalysisManager,
  ) {
    super(functionIR);
  }

  protected step(): OptimizationResult {
    let changed = false;

    for (const [, block] of this.functionIR.blocks) {
      if (this.coalesceDeclarations(block)) changed = true;
      if (this.coalesceIntermediateCopies(block)) changed = true;
    }

    return { changed };
  }

  // ---------------------------------------------------------------------------
  // Pattern 1: Declaration coalescing
  // ---------------------------------------------------------------------------

  private coalesceDeclarations(block: BasicBlock): boolean {
    let changed = false;

    const undefinedStores = new Map<
      DeclarationId,
      { index: number; storeInstr: StoreLocalInstruction }
    >();

    for (let i = 0; i < block.instructions.length; i++) {
      const instr = block.instructions[i];

      if (instr instanceof StoreLocalInstruction && instr.type === "let") {
        const valueDef = instr.value.identifier.definer;
        if (valueDef instanceof LiteralInstruction && valueDef.value === undefined) {
          undefinedStores.set(instr.lval.identifier.declarationId, {
            index: i,
            storeInstr: instr,
          });
        }
        continue;
      }

      if (instr instanceof CopyInstruction) {
        const declId = instr.lval.identifier.declarationId;
        const entry = undefinedStores.get(declId);
        if (entry) {
          if (!this.isReadBetween(block, entry.index + 1, i, declId)) {
            const loadInstr = instr.value.identifier.definer;
            let valuePlace = instr.value;
            if (loadInstr instanceof LoadLocalInstruction) {
              valuePlace = loadInstr.value;
            }

            block.replaceInstruction(
              entry.index,
              new StoreLocalInstruction(
                entry.storeInstr.id,
                entry.storeInstr.place,
                entry.storeInstr.nodePath,
                entry.storeInstr.lval,
                valuePlace,
                entry.storeInstr.type,
                entry.storeInstr.bindings,
              ),
            );

            const nextIdx = block.instructions.indexOf(instr) + 1;
            if (nextIdx < block.instructions.length) {
              const nextInstr = block.instructions[nextIdx];
              if (
                nextInstr instanceof ExpressionStatementInstruction &&
                nextInstr.expression.identifier.id === instr.place.identifier.id
              ) {
                block.removeInstructionAt(nextIdx);
              }
            }

            const copyIdx = block.instructions.indexOf(instr);
            if (copyIdx !== -1) block.removeInstructionAt(copyIdx);

            if (
              loadInstr instanceof LoadLocalInstruction &&
              loadInstr.place.identifier.uses.size === 0
            ) {
              const loadIdx = block.instructions.indexOf(loadInstr as BaseInstruction);
              if (loadIdx !== -1) block.removeInstructionAt(loadIdx);
            }

            changed = true;
            break;
          }

          undefinedStores.delete(declId);
        }
      }

      for (const readPlace of instr.getReadPlaces()) {
        undefinedStores.delete(readPlace.identifier.declarationId);
      }
    }

    return changed;
  }

  // ---------------------------------------------------------------------------
  // Pattern 2: Interference-based intermediate elimination
  // ---------------------------------------------------------------------------

  private coalesceIntermediateCopies(block: BasicBlock): boolean {
    const liveness = this.AM.get(BlockLivenessAnalysis, this.functionIR);
    let changed = false;

    for (let i = 0; i < block.instructions.length; i++) {
      const instr = block.instructions[i];

      if (instr instanceof CopyInstruction) {
        const result = this.resolveIntermediate(block, instr.value);
        if (result && this.canCoalesce(instr.lval, result.place, liveness)) {
          block.replaceInstruction(
            i,
            new CopyInstruction(instr.id, instr.place, instr.nodePath, instr.lval, result.place),
          );
          changed = true;
        }
      } else if (instr instanceof StoreLocalInstruction) {
        const result = this.resolveIntermediate(block, instr.value);
        if (result && this.canCoalesce(instr.lval, result.place, liveness)) {
          block.replaceInstruction(
            i,
            new StoreLocalInstruction(
              instr.id,
              instr.place,
              instr.nodePath,
              instr.lval,
              result.place,
              instr.type,
              instr.bindings,
            ),
          );
          changed = true;
        }
      }
    }

    return changed;
  }

  /**
   * Check if coalescing is safe: the destination and the resolved source
   * must not interfere.
   *
   * Determines the source variable's DeclarationId:
   * - If the resolved place was loaded from a variable (LoadLocal/LoadPhi),
   *   check that variable's DeclarationId.
   * - Otherwise, check the resolved place's own DeclarationId.
   *
   * Self-copies (same DeclarationId) are always safe.
   * Values with no trackable source (e.g., computation results) are always safe.
   */
  private canCoalesce(
    dstPlace: Place,
    resolvedPlace: Place,
    liveness: BlockLivenessResult,
  ): boolean {
    const dstDecl = dstPlace.identifier.declarationId;
    const srcDecl = this.resolveSourceDecl(resolvedPlace);

    // No trackable source — can't verify safety, don't coalesce.
    if (srcDecl === undefined) return false;

    // Self-copy — always safe.
    if (srcDecl === dstDecl) return true;

    // Full interference check.
    return !this.interferesForCopy(dstDecl, srcDecl, liveness);
  }

  // ---------------------------------------------------------------------------
  // Intermediate resolution
  // ---------------------------------------------------------------------------

  private resolveIntermediate(
    _block: BasicBlock,
    valuePlace: Place,
  ): { place: Place } | undefined {
    // Case 1: value → LoadLocal(tmp) → StoreLocal(tmp, expr) with tmp single-use.
    const definer = valuePlace.identifier.definer;
    if (definer instanceof LoadLocalInstruction) {
      const varPlace = definer.value;
      const storeDefiner = varPlace.identifier.definer;
      if (
        storeDefiner instanceof StoreLocalInstruction &&
        storeDefiner.bindings.length === 0 &&
        varPlace.identifier.uses.size === 1
      ) {
        let resolved = storeDefiner.value;

        // Follow through StoreLocal result places. The IR uses
        // StoreLocal.place as the canonical value reference for a
        // declared variable (e.g., `const y = x` stores from
        // StoreLocal(x).place). Follow to the stored value so the
        // resolution reaches the actual expression, not the IR artifact.
        const resolvedDefiner = resolved.identifier.definer;
        if (
          resolvedDefiner instanceof StoreLocalInstruction &&
          resolvedDefiner.place.identifier === resolved.identifier
        ) {
          resolved = resolvedDefiner.value;
        }

        return { place: resolved };
      }
    }

    // Case 2: value IS a variable lval from a single-use StoreLocal.
    const varDefiner = valuePlace.identifier.definer;
    if (
      varDefiner instanceof StoreLocalInstruction &&
      varDefiner.bindings.length === 0 &&
      varDefiner.lval.identifier === valuePlace.identifier &&
      valuePlace.identifier.uses.size === 1
    ) {
      return { place: varDefiner.value };
    }

    return undefined;
  }

  /**
   * Determine the source variable's DeclarationId from a resolved place.
   *
   * If the place was produced by loading a variable (LoadLocal or LoadPhi),
   * returns that variable's DeclarationId. Otherwise returns the place's
   * own DeclarationId if it has a definer, or undefined.
   */
  private resolveSourceDecl(place: Place): DeclarationId | undefined {
    const definer = place.identifier.definer;
    if (definer instanceof LoadLocalInstruction || definer instanceof LoadPhiInstruction) {
      return definer.value.identifier.declarationId;
    }
    if (definer) {
      return place.identifier.declarationId;
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Interference check (textbook Boissinot)
  // ---------------------------------------------------------------------------

  /**
   * Check if two variables (by DeclarationId) interfere.
   *
   * Walks each block backward from LiveOut, maintaining the local live
   * set. At each program point (before processing each instruction),
   * checks if both variables are simultaneously live. Returns true if
   * overlap found anywhere.
   */
  private interferesForCopy(
    a: DeclarationId,
    b: DeclarationId,
    liveness: BlockLivenessResult,
  ): boolean {
    for (const [blockId, block] of this.functionIR.blocks) {
      const live = new Set(liveness.getLiveOut(blockId));

      // Check at block exit.
      if (live.has(a) && live.has(b)) return true;

      // Walk backward.
      for (let i = block.instructions.length - 1; i >= 0; i--) {
        const instr = block.instructions[i];

        // Collect written declarations.
        const writtenDecls = new Set<DeclarationId>();
        for (const place of instr.getWrittenPlaces()) {
          writtenDecls.add(place.identifier.declarationId);
        }

        // Defs: variable dies above its definition.
        for (const declId of writtenDecls) {
          live.delete(declId);
        }

        // Uses: variable is live above its use (excluding writes).
        for (const place of instr.getReadPlaces()) {
          const declId = place.identifier.declarationId;
          if (!writtenDecls.has(declId)) {
            live.add(declId);
          }
        }

        // Check after processing (= point just before this instruction).
        if (live.has(a) && live.has(b)) return true;
      }
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private isReadBetween(
    block: BasicBlock,
    start: number,
    end: number,
    declId: DeclarationId,
  ): boolean {
    for (let i = start; i < end; i++) {
      const instr = block.instructions[i];
      if (
        instr instanceof LoadLocalInstruction &&
        instr.value.identifier.declarationId === declId
      ) {
        return true;
      }
    }
    return false;
  }
}
