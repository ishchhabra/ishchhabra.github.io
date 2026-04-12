import {
  BaseInstruction,
  BlockId,
  DeclarationId,
  LiteralInstruction,
  LoadLocalInstruction,
  StoreLocalInstruction,
  TPrimitiveValue,
} from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { AnalysisManager } from "../../analysis/AnalysisManager";
import { ControlFlowGraphAnalysis } from "../../analysis/ControlFlowGraphAnalysis";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";

/**
 * Forward constant propagation.
 *
 * Rewrites loads of constant variables to use the constant directly.
 *
 * Example:
 *
 *   const x = 1;
 *   const y = x;
 *
 * becomes:
 *
 *   const x = 1;
 *   const y = 1;
 */
export class LateConstantPropagationPass extends BaseOptimizationPass {
  constructor(
    protected readonly functionIR: FunctionIR,
    private readonly AM: AnalysisManager,
  ) {
    super(functionIR);
  }

  protected step(): OptimizationResult {
    const outState = new Map<BlockId, ConstState>();

    let changed = false;

    for (const [blockId, block] of this.functionIR.blocks) {
      const state = this.meet(blockId, outState);

      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i];

        // ------------------------------------------------------------
        // Rewrite loads using known constants
        // ------------------------------------------------------------

        if (instr instanceof LoadLocalInstruction) {
          const decl = instr.value.identifier.declarationId;
          const value = state.get(decl);

          if (value && value.kind === "const") {
            const litInstr = new LiteralInstruction(instr.id, instr.place, value.value);

            block.replaceInstruction(i, litInstr);

            changed = true;
            continue;
          }
        }

        // ------------------------------------------------------------
        // Transfer
        // ------------------------------------------------------------

        this.transfer(instr, state);
      }

      outState.set(blockId, state);
    }

    return { changed };
  }

  private meet(blockId: BlockId, outState: Map<BlockId, ConstState>): ConstState {
    const preds = this.AM.get(ControlFlowGraphAnalysis, this.functionIR).predecessors.get(blockId);

    if (!preds || preds.size === 0) {
      return new Map();
    }

    let result: ConstState | undefined;

    for (const pred of preds) {
      const predState = outState.get(pred);
      if (!predState) continue;

      if (!result) {
        result = new Map(predState);
        continue;
      }

      for (const [decl, val] of result) {
        const other = predState.get(decl);
        if (!other || !this.equal(val, other)) {
          result.set(decl, TOP);
        }
      }
    }

    return result ?? new Map();
  }

  private transfer(instr: BaseInstruction, state: ConstState): void {
    if (instr instanceof StoreLocalInstruction) {
      const x = instr.lval.identifier.declarationId;

      const valueDef = instr.value.identifier.definer;

      if (valueDef instanceof LiteralInstruction) {
        state.set(x, { kind: "const", value: valueDef.value });
      } else {
        state.set(x, TOP);
      }
    }
  }

  private equal(a: ConstValue, b: ConstValue): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === "const" && b.kind === "const") return a.value === b.value;
    return true;
  }
}

type ConstState = Map<DeclarationId, ConstValue>;

type ConstValue = { kind: "const"; value: TPrimitiveValue } | typeof TOP;

const TOP = { kind: "top" } as const;
