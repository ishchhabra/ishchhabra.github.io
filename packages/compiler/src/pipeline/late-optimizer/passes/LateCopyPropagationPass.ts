import {
  BlockId,
  CopyInstruction,
  DeclarationId,
  IdentifierId,
  LiteralInstruction,
  LoadLocalInstruction,
  Place,
  StoreLocalInstruction,
} from "../../../ir";
import { Identifier } from "../../../ir/core/Identifier";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";

/**
 * Textbook forward copy propagation + const-literal forwarding.
 *
 *   1. **Copy propagation**: when `x` copies `y`, rewrite `LoadLocal(x)`
 *      → `LoadLocal(y)`. Uses forward dataflow with intersection meet.
 *
 *   2. **Const-literal forwarding**: when `const x = <literal>`, rewrite
 *      reads of `x` to reference the literal directly. Also propagates
 *      into terminal operands (e.g., `return x` → `return <literal>`).
 */
export class LateCopyPropagationPass extends BaseOptimizationPass {

  protected step(): OptimizationResult {
    return { changed: this.propagateAndForwardLiterals() };
  }

  // ---------------------------------------------------------------------------
  // Phase 1 + 2: Copy propagation + const-literal forwarding
  // ---------------------------------------------------------------------------

  private propagateAndForwardLiterals(): boolean {
    const placeSource = new Map<IdentifierId, Place>();
    const constForward = new Map<Identifier, Place>();

    for (const block of this.functionIR.blocks.values()) {
      for (const instr of block.instructions) {
        if (instr instanceof LoadLocalInstruction) {
          placeSource.set(instr.place.identifier.id, instr.value);
        }

        if (instr instanceof StoreLocalInstruction && instr.type === "const") {
          const valueDef = instr.value.identifier.definer;
          if (valueDef instanceof LiteralInstruction) {
            placeSource.set(instr.lval.identifier.id, instr.value);
            constForward.set(instr.lval.identifier, instr.value);
          }
        }
      }
    }

    const copyOut = new Map<BlockId, CopyState>();
    let changed = false;

    for (const [blockId, block] of this.functionIR.blocks) {
      const state = this.meet(blockId, copyOut);

      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i];

        if (instr instanceof LoadLocalInstruction) {
          const resolved = this.resolve(state, instr.value.identifier.declarationId);
          if (
            resolved &&
            resolved.identifier.declarationId !== instr.value.identifier.declarationId
          ) {
            block.replaceInstruction(
              i,
              new LoadLocalInstruction(instr.id, instr.place, instr.nodePath, resolved),
            );
            placeSource.set(instr.place.identifier.id, resolved);
            changed = true;
          } else {
            const forwarded = placeSource.get(instr.value.identifier.id);
            if (forwarded && forwarded.identifier.id !== instr.value.identifier.id) {
              block.replaceInstruction(
                i,
                new LoadLocalInstruction(instr.id, instr.place, instr.nodePath, forwarded),
              );
              placeSource.set(instr.place.identifier.id, forwarded);
              changed = true;
            }
          }
        }

        this.transfer(block.instructions[i], state, placeSource);
      }

      if (block.terminal && constForward.size > 0) {
        const rewritten = block.terminal.rewrite(constForward);
        if (rewritten !== block.terminal) {
          block.terminal = rewritten;
          changed = true;
        }
      }

      copyOut.set(blockId, state);
    }

    return changed;
  }


  // ---------------------------------------------------------------------------
  // Dataflow helpers
  // ---------------------------------------------------------------------------

  private meet(blockId: BlockId, copyOut: Map<BlockId, CopyState>): CopyState {
    const preds = this.functionIR.predecessors.get(blockId);
    if (!preds || preds.size === 0) {
      return new Map();
    }

    let result: CopyState | undefined;
    for (const predId of preds) {
      const predState = copyOut.get(predId);
      if (predState === undefined) continue;
      if (result === undefined) {
        result = new Map(predState);
      } else {
        for (const [declId, place] of result) {
          const other = predState.get(declId);
          if (!other || other.identifier.declarationId !== place.identifier.declarationId) {
            result.delete(declId);
          }
        }
      }
    }

    return result ?? new Map();
  }

  private transfer(
    instr: import("../../../ir").BaseInstruction,
    state: CopyState,
    placeSource: Map<IdentifierId, Place>,
  ): void {
    if (instr instanceof CopyInstruction || instr instanceof StoreLocalInstruction) {
      const lvalDeclId = instr.lval.identifier.declarationId;

      this.kill(state, lvalDeclId);

      const src = placeSource.get(instr.value.identifier.id);
      if (src) {
        const resolved = this.resolve(state, src.identifier.declarationId) ?? src;
        if (resolved.identifier.declarationId !== lvalDeclId) {
          state.set(lvalDeclId, resolved);
        }
      }
    }
  }

  private kill(state: CopyState, declId: DeclarationId): void {
    state.delete(declId);
    for (const [key, val] of state) {
      if (val.identifier.declarationId === declId) {
        state.delete(key);
      }
    }
  }

  private resolve(state: CopyState, declId: DeclarationId): Place | undefined {
    const visited = new Set<DeclarationId>();
    let current = declId;
    let result: Place | undefined;

    while (!visited.has(current)) {
      visited.add(current);
      const source = state.get(current);
      if (!source) break;
      result = source;
      current = source.identifier.declarationId;
    }

    return result;
  }
}

type CopyState = Map<DeclarationId, Place>;
