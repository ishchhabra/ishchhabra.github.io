import { CopyOp, DeclarationId, LoadLocalOp, StoreLocalOp } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { Place } from "../../../ir/core";
import { LoadPhiOp } from "../../../ir/ops/mem/LoadPhi";
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

    for (const block of this.functionIR.allBlocks()) {
      for (let i = 0; i < block.operations.length; i++) {
        const instr = block.operations[i];

        if (!(instr instanceof CopyOp)) continue;

        const dst = instr.lval.identifier.declarationId;
        const src = instr.value.identifier.declarationId;

        if (!this.canCoalesce(instr, dst, src)) continue;

        this.replaceLoads(dst, instr.value);

        block.removeOpAt(i);
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
  private canCoalesce(copyInstr: CopyOp, dst: DeclarationId, src: DeclarationId): boolean {
    for (const block of this.functionIR.allBlocks()) {
      for (const instr of block.operations) {
        // dst must have exactly one definition — the Copy we're removing.
        // If anything else writes to dst, coalescing is unsound.
        if (instr !== copyInstr) {
          if (instr instanceof StoreLocalOp && instr.lval.identifier.declarationId === dst) {
            return false;
          }
          if (instr instanceof CopyOp && instr.lval.identifier.declarationId === dst) {
            return false;
          }
        }

        // If src is redefined anywhere a use of dst could reach, the
        // use would see the wrong value after rewriting.
        if (instr instanceof StoreLocalOp && instr.lval.identifier.declarationId === src) {
          return false;
        }
        if (
          instr !== copyInstr &&
          instr instanceof CopyOp &&
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
    for (const block of this.functionIR.allBlocks()) {
      for (let i = 0; i < block.operations.length; i++) {
        const instr = block.operations[i];

        if (instr instanceof LoadLocalOp && instr.value.identifier.declarationId === dst) {
          block.replaceOp(i, new LoadLocalOp(instr.id, instr.place, srcPlace));
        } else if (instr instanceof LoadPhiOp && instr.value.identifier.declarationId === dst) {
          block.replaceOp(i, new LoadPhiOp(instr.id, instr.place, srcPlace));
        } else if (instr instanceof CopyOp && instr.value.identifier.declarationId === dst) {
          block.replaceOp(i, new CopyOp(instr.id, instr.place, instr.lval, srcPlace));
        }
      }
    }
  }
}
