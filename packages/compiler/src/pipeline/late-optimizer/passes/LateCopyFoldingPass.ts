import {
  BaseInstruction,
  CopyInstruction,
  DeclareLocalInstruction,
  ExpressionStatementInstruction,
  IdentifierId,
  LoadLocalInstruction,
  StoreLocalInstruction,
} from "../../../ir";
import { BasicBlock } from "../../../ir/core/Block";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { LoadPhiInstruction } from "../../../ir/instructions/memory/LoadPhi";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";

/**
 * Late Copy Folding.
 *
 * Eliminates the local copy patterns introduced by SSA destruction:
 *
 *   StoreLocal(x, value)
 *   LoadLocal(tmp, x)
 *   Copy(phi, tmp)
 *
 * becomes:
 *
 *   Copy(phi, value)
 *
 * and:
 *
 *   StoreLocal(x, init)
 *   Copy(x, value)
 *
 * becomes:
 *
 *   StoreLocal(x, value)
 *
 * The pass is intentionally local to a basic block. The outer late
 * optimizer reruns the pass to a fixpoint, so preserving the two
 * textbook folds is enough to recover longer chains as well.
 */
export class LateCopyFoldingPass extends BaseOptimizationPass {
  constructor(protected readonly functionIR: FunctionIR) {
    super(functionIR);
  }

  protected step(): OptimizationResult {
    let changed = false;
    const loadCounts = this.countLoads();

    for (const block of this.functionIR.blocks.values()) {
      changed = this.foldExpressionInliningInBlock(block, loadCounts) || changed;
      changed = this.foldInitialValueInBlock(block) || changed;
    }

    return { changed };
  }

  private foldExpressionInliningInBlock(
    block: BasicBlock,
    loadCounts: Map<IdentifierId, number>,
  ): boolean {
    let changed = false;

    for (let copyIdx = 0; copyIdx < block.instructions.length; copyIdx++) {
      const match = this.matchExpressionInlining(block, copyIdx, loadCounts);
      if (!match) continue;

      const { copy, loadIdx, storeIdx, store } = match;

      block.replaceInstruction(
        copyIdx,
        new CopyInstruction(copy.id, copy.place, copy.lval, store.value),
      );

      const indicesToRemove = [loadIdx, storeIdx];
      const bindingIdx = this.findRemovableBinding(block, storeIdx, store);
      if (bindingIdx !== undefined) {
        indicesToRemove.push(bindingIdx);
      }

      this.removeInstructionIndices(block, indicesToRemove);
      copyIdx = Math.max(-1, storeIdx - 1);
      changed = true;
    }

    return changed;
  }

  private foldInitialValueInBlock(block: BasicBlock): boolean {
    let changed = false;

    for (let copyIdx = 0; copyIdx < block.instructions.length; copyIdx++) {
      const copy = block.instructions[copyIdx];
      if (!(copy instanceof CopyInstruction)) continue;

      const storeIdx = this.findReachingStore(block.instructions, copyIdx, copy.lval.identifier.id);
      if (storeIdx === undefined) continue;

      const adjusted = this.ensureValueAvailable(block, storeIdx, copyIdx, copy);
      if (!adjusted) continue;

      const store = block.instructions[adjusted.storeIdx];
      if (!(store instanceof StoreLocalInstruction)) {
        continue;
      }

      block.replaceInstruction(
        adjusted.storeIdx,
        new StoreLocalInstruction(
          store.id,
          store.place,
          store.lval,
          copy.value,
          store.type,
          store.kind,
          store.bindings,
        ),
      );

      const indicesToRemove = [adjusted.copyIdx];
      const expressionStmtIdx = this.findRedundantExpressionStatement(
        block,
        adjusted.copyIdx,
        copy,
      );
      if (expressionStmtIdx !== undefined) {
        indicesToRemove.push(expressionStmtIdx);
      }

      this.removeInstructionIndices(block, indicesToRemove);
      copyIdx = Math.max(-1, adjusted.storeIdx - 1);
      changed = true;
    }

    return changed;
  }

  private matchExpressionInlining(
    block: BasicBlock,
    copyIdx: number,
    loadCounts: Map<IdentifierId, number>,
  ):
    | {
        copy: CopyInstruction;
        loadIdx: number;
        storeIdx: number;
        store: StoreLocalInstruction;
      }
    | undefined {
    const copy = block.instructions[copyIdx];
    if (!(copy instanceof CopyInstruction)) {
      return undefined;
    }

    const load = copy.value.identifier.definer;
    if (!(load instanceof LoadLocalInstruction)) {
      return undefined;
    }

    const loadIdx = block.instructions.indexOf(load);
    if (loadIdx === -1 || loadIdx >= copyIdx) {
      return undefined;
    }

    const storedVariableId = load.value.identifier.id;
    if ((loadCounts.get(storedVariableId) ?? 0) !== 1) {
      return undefined;
    }

    const store = load.value.identifier.definer;
    if (!(store instanceof StoreLocalInstruction)) {
      return undefined;
    }

    const storeIdx = block.instructions.indexOf(store);
    if (storeIdx === -1 || storeIdx >= loadIdx) {
      return undefined;
    }

    if (store.lval.identifier.id !== storedVariableId) {
      return undefined;
    }

    if (store.place.identifier.uses.size > 0) {
      return undefined;
    }

    return { copy, loadIdx, storeIdx, store };
  }

  /**
   * Finds the most recent StoreLocal that reaches `copyIdx` without an
   * intervening read of the destination variable.
   */
  private findReachingStore(
    instructions: BaseInstruction[],
    copyIdx: number,
    destinationId: IdentifierId,
  ): number | undefined {
    for (let i = copyIdx - 1; i >= 0; i--) {
      const instruction = instructions[i];

      if (
        instruction instanceof StoreLocalInstruction &&
        instruction.lval.identifier.id === destinationId
      ) {
        return i;
      }

      if (instruction.getOperands().some((place) => place.identifier.id === destinationId)) {
        return undefined;
      }
    }

    return undefined;
  }

  /**
   * Ensures the copied value is available at the StoreLocal.
   *
   * If the value is defined by a pure leaf instruction located between
   * the StoreLocal and the Copy, hoist that definer above the StoreLocal.
   */
  private ensureValueAvailable(
    block: BasicBlock,
    storeIdx: number,
    copyIdx: number,
    copy: CopyInstruction,
  ): { storeIdx: number; copyIdx: number } | undefined {
    const definer = copy.value.identifier.definer;
    if (!(definer instanceof BaseInstruction)) {
      return { storeIdx, copyIdx };
    }

    const valueIdx = block.instructions.indexOf(definer);
    if (valueIdx === -1 || valueIdx < storeIdx) {
      return { storeIdx, copyIdx };
    }

    if (valueIdx > storeIdx && valueIdx < copyIdx) {
      if (definer.getOperands().length > 0) {
        return undefined;
      }

      block.removeInstructionAt(valueIdx);
      block.insertInstructionAt(storeIdx, definer);
      return { storeIdx: storeIdx + 1, copyIdx: copyIdx + 1 };
    }

    return undefined;
  }

  private countLoads(): Map<IdentifierId, number> {
    const counts = new Map<IdentifierId, number>();

    for (const block of this.functionIR.blocks.values()) {
      for (const instruction of block.instructions) {
        if (
          instruction instanceof LoadLocalInstruction ||
          instruction instanceof LoadPhiInstruction
        ) {
          const id = instruction.value.identifier.id;
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
    }

    return counts;
  }

  private findRemovableBinding(
    block: BasicBlock,
    storeIdx: number,
    store: StoreLocalInstruction,
  ): number | undefined {
    if (storeIdx === 0) {
      return undefined;
    }

    const previous = block.instructions[storeIdx - 1];
    if (
      previous instanceof DeclareLocalInstruction &&
      previous.place.identifier.id === store.lval.identifier.id &&
      previous.place.identifier.uses.size === 0
    ) {
      return storeIdx - 1;
    }

    return undefined;
  }

  private findRedundantExpressionStatement(
    block: BasicBlock,
    copyIdx: number,
    copy: CopyInstruction,
  ): number | undefined {
    const next = block.instructions[copyIdx + 1];
    if (
      next instanceof ExpressionStatementInstruction &&
      next.expression.identifier.id === copy.place.identifier.id
    ) {
      return copyIdx + 1;
    }

    return undefined;
  }

  private removeInstructionIndices(block: BasicBlock, indices: number[]): void {
    const uniqueDescending = [...new Set(indices)].sort((left, right) => right - left);
    for (const index of uniqueDescending) {
      block.removeInstructionAt(index);
    }
  }
}
