import {
  CopyInstruction,
  DeclarationId,
  LoadLocalInstruction,
  StoreLocalInstruction,
} from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { Place } from "../../../ir/core";
import { LoadPhiInstruction } from "../../../ir/instructions/memory/LoadPhi";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";

/**
 * Late Copy Coalescing
 *
 * Eliminates redundant copies:
 *
 *   x = y
 *
 * by rewriting loads of `x` to load `y` instead when safe,
 * then removing the copy instruction.
 *
 * Designed to run after SSA destruction.
 */
export class LateCopyCoalescingPass extends BaseOptimizationPass {
  constructor(protected readonly functionIR: FunctionIR) {
    super(functionIR);
  }

  protected step(): OptimizationResult {
    let changed = false;

    for (const [, block] of this.functionIR.blocks) {
      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i];

        if (!(instr instanceof CopyInstruction)) continue;

        const dst = instr.lval.identifier.declarationId;
        const src = instr.value.identifier.declarationId;

        if (!this.canCoalesce(instr, dst, src)) continue;

        this.replaceLoads(dst, instr.value);

        block.removeInstructionAt(i);
        i--;

        changed = true;
      }
    }

    return { changed };
  }

  /**
   * Determines if we can safely merge `dst` into `src`.
   *
   * Unsafe when `src` is redefined between the copy and a use of `dst`,
   * since the use would then see the wrong value.
   */
  private canCoalesce(copyInstr: CopyInstruction, dst: DeclarationId, src: DeclarationId): boolean {
    for (const [, block] of this.functionIR.blocks) {
      for (const instr of block.instructions) {
        // dst must have exactly one definition — the Copy we're removing.
        // If anything else writes to dst, coalescing is unsound.
        if (instr !== copyInstr) {
          if (
            instr instanceof StoreLocalInstruction &&
            instr.lval.identifier.declarationId === dst
          ) {
            return false;
          }
          if (instr instanceof CopyInstruction && instr.lval.identifier.declarationId === dst) {
            return false;
          }
        }

        // If src is redefined anywhere a use of dst could reach, the
        // use would see the wrong value after rewriting.
        if (instr instanceof StoreLocalInstruction && instr.lval.identifier.declarationId === src) {
          return false;
        }
        if (
          instr !== copyInstr &&
          instr instanceof CopyInstruction &&
          instr.lval.identifier.declarationId === src
        ) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Rewrite all LoadLocal / LoadPhi / Copy-value reads of `dst` to
   * read from `srcPlace` instead.
   */
  private replaceLoads(dst: DeclarationId, srcPlace: Place): void {
    for (const [, block] of this.functionIR.blocks) {
      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i];

        if (instr instanceof LoadLocalInstruction && instr.value.identifier.declarationId === dst) {
          block.replaceInstruction(
            i,
            new LoadLocalInstruction(instr.id, instr.place, instr.nodePath, srcPlace),
          );
        } else if (
          instr instanceof LoadPhiInstruction &&
          instr.value.identifier.declarationId === dst
        ) {
          block.replaceInstruction(
            i,
            new LoadPhiInstruction(instr.id, instr.place, instr.nodePath, srcPlace),
          );
        } else if (
          instr instanceof CopyInstruction &&
          instr.value.identifier.declarationId === dst
        ) {
          block.replaceInstruction(
            i,
            new CopyInstruction(instr.id, instr.place, instr.nodePath, instr.lval, srcPlace),
          );
        }
      }
    }
  }
}
