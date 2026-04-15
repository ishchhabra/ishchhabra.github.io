import {
  Operation,
  BlockId,
  DeclarationId,
  LiteralOp,
  LoadLocalOp,
  StoreLocalOp,
  TPrimitiveValue,
} from "../../../ir";
import { BasicBlock } from "../../../ir/core/Block";
import { FuncOp } from "../../../ir/core/FuncOp";
import { Trait } from "../../../ir/core/Operation";
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
    protected readonly funcOp: FuncOp,
    private readonly AM: AnalysisManager,
  ) {
    super(funcOp);
  }

  protected step(): OptimizationResult {
    const outState = new Map<BlockId, ConstState>();

    let changed = false;

    for (const block of this.funcOp.allBlocks()) {
      const blockId = block.id;
      const state = this.meet(blockId, outState);

      if (this.processBlock(block, state)) changed = true;

      outState.set(blockId, state);
    }

    return { changed };
  }

  /**
   * Walk a block's ops, folding LoadLocal → Literal where the reaching
   * value is a constant, and updating state via `transfer`.
   * Structured ops are walked recursively so variables mutated in
   * nested regions are marked as TOP on return.
   */
  private processBlock(block: BasicBlock, state: ConstState): boolean {
    let changed = false;
    for (const instr of block.operations) {
      if (instr instanceof LoadLocalOp) {
        const decl = instr.value.identifier.declarationId;
        const value = state.get(decl);
        if (value && value.kind === "const") {
          const litInstr = new LiteralOp(instr.id, instr.place, value.value);
          block.replaceOp(instr, litInstr);
          changed = true;
          continue;
        }
      }

      if (instr.hasTrait(Trait.HasRegions)) {
        // Conservative handling: any declaration stored to in any
        // region becomes TOP in the parent state.
        for (const decl of this.collectStoredDecls(instr)) {
          state.set(decl, TOP);
        }
        continue;
      }

      this.transfer(instr, state);
    }
    return changed;
  }

  private collectStoredDecls(op: Operation): Set<DeclarationId> {
    const decls = new Set<DeclarationId>();
    const walk = (inner: Operation) => {
      if (inner instanceof StoreLocalOp) {
        decls.add(inner.lval.identifier.declarationId);
      }
      if (inner.hasTrait(Trait.HasRegions)) {
        for (const region of inner.regions) {
          for (const block of region.blocks) {
            for (const op2 of block.operations) walk(op2);
          }
        }
      }
    };
    walk(op);
    return decls;
  }

  private meet(blockId: BlockId, outState: Map<BlockId, ConstState>): ConstState {
    const preds = this.AM.get(ControlFlowGraphAnalysis, this.funcOp).predecessors.get(blockId);

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

  private transfer(instr: Operation, state: ConstState): void {
    if (instr instanceof StoreLocalOp) {
      const x = instr.lval.identifier.declarationId;

      // Only `const` bindings can carry a known literal value — `let`
      // variables can be reassigned, so their value at any later use
      // site is not statically knowable from a single store.
      if (instr.type !== "const") {
        state.set(x, TOP);
        return;
      }

      const valueDef = instr.value.identifier.definer;

      if (valueDef instanceof LiteralOp) {
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
