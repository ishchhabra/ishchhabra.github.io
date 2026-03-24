import {
  BasicBlock,
  CopyInstruction,
  DeclarationId,
  ExpressionStatementInstruction,
  LoadLocalInstruction,
  StoreLocalInstruction,
} from "../../../ir";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";

/**
 * Local (intra-block) dead store elimination.
 *
 * A store to a variable is dead when a subsequent store to the same
 * variable occurs in the same basic block with no intervening read.
 * This pass removes such dead stores.
 *
 * For example:
 *
 * ```
 *   StoreLocal(x, v1)     // dead — overwritten before being read
 *   CopyInstruction(x, v2)
 * ```
 *
 * After elimination:
 *
 * ```
 *   StoreLocal(x, v2)     // the Copy inherits the StoreLocal's declaration
 * ```
 *
 * When the dead store is a StoreLocal (which carries a variable declaration)
 * and the overwriting instruction is a CopyInstruction, the Copy is promoted
 * to a StoreLocal to preserve the declaration metadata (let/const/var).
 * Any ExpressionStatement wrapping the original Copy is also removed, since
 * the promoted StoreLocal already emits the declaration.
 *
 * This pass is especially effective after phi elimination, which inserts
 * `StoreLocal` initializations immediately followed by `CopyInstruction`
 * updates to the same variable.
 */
export class LateDeadStoreEliminationPass extends BaseOptimizationPass {
  protected step(): OptimizationResult {
    let changed = false;
    for (const block of this.functionIR.blocks.values()) {
      if (this.eliminateDeadStoresInBlock(block)) {
        changed = true;
      }
    }
    return { changed };
  }

  private eliminateDeadStoresInBlock(block: BasicBlock): boolean {
    const instrs = block.instructions;

    // Maps a declaration → the index of its most recent write that has
    // not yet been invalidated by a read.
    const lastWrite = new Map<DeclarationId, number>();
    const dead = new Set<number>();

    for (let i = 0; i < instrs.length; i++) {
      const instr = instrs[i];

      // A LoadLocal reads a variable — its pending write is live.
      if (instr instanceof LoadLocalInstruction) {
        lastWrite.delete(instr.value.identifier.declarationId);
        continue;
      }

      if (instr instanceof StoreLocalInstruction || instr instanceof CopyInstruction) {
        const declId = instr.lval.identifier.declarationId;

        // If there is a pending write to this declaration, it is dead.
        const deadIndex = lastWrite.get(declId);
        if (deadIndex !== undefined) {
          const deadInstr = instrs[deadIndex];

          // If the dead instruction carried a variable declaration and
          // the overwriting instruction is a bare Copy, promote the
          // Copy to a StoreLocal so the declaration is preserved.
          if (deadInstr instanceof StoreLocalInstruction && instr instanceof CopyInstruction) {
            instrs[i] = new StoreLocalInstruction(
              instr.id,
              instr.place,
              instr.nodePath,
              instr.lval,
              instr.value,
              deadInstr.type,
              deadInstr.bindings,
            );

            // Phi elimination wraps each Copy in an ExpressionStatement.
            // Now that the Copy has been promoted to a StoreLocal (which
            // emits its own declaration), the wrapper would cause codegen
            // to emit a duplicate.  Remove it.
            const next = instrs[i + 1];
            if (
              next instanceof ExpressionStatementInstruction &&
              next.expression.id === instr.place.id
            ) {
              dead.add(i + 1);
            }
          }

          dead.add(deadIndex);
        }

        lastWrite.set(declId, i);
      }
    }

    if (dead.size === 0) {
      return false;
    }

    block.instructions = instrs.filter((_, i) => !dead.has(i));
    return true;
  }
}
