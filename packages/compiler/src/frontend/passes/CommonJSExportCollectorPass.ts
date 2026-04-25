import { Operation, BlockId, LoadGlobalOp } from "../../ir";
import { FuncOp } from "../../ir/core/FuncOp";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { ReturnTermOp, ThrowTermOp } from "../../ir/ops/control";
import { StoreStaticPropertyOp } from "../../ir/ops/prop/StoreStaticProperty";
import { AnalysisManager } from "../../pipeline/analysis/AnalysisManager";
import { DominatorTreeAnalysis } from "../../pipeline/analysis/DominatorTreeAnalysis";

const EXPORTS_PROPERTY_NAME = "exports";

/**
 * A pass that scans for and collects CommonJS exports in the IR, populating the
 * `moduleUnit.exports` map accordingly. This identifiers assignments to
 * `module.exports` (or `exports`) and  marks those properties or values
 * as module exports at the IR level.
 *
 *  Example:
 * ```js
 * // Original code:
 * module.exports.foo = 42;
 *
 * // After this pass, `moduleUnit.exports` will have an entry for "foo"
 * // referencing the IR node that produced the value 42.
 * ```
 */
export class CommonJSExportCollectorPass {
  constructor(
    private readonly funcOp: FuncOp,
    private readonly moduleIR: ModuleIR,
    private readonly AM: AnalysisManager,
  ) {}

  public run() {
    for (const block of this.funcOp.blocks) {
      const blockId = block.id;
      if (!this.isAlwaysExecutedBlock(blockId)) {
        continue;
      }

      for (const instruction of block.operations) {
        if (!this.isModuleExportInstruction(instruction)) {
          continue;
        }

        this.moduleIR.exports.set("default", {
          instruction,
          declaration: instruction.value.def as Operation,
        });
      }
    }
  }

  private isModuleExportInstruction(instruction: Operation): instruction is StoreStaticPropertyOp {
    if (
      !(instruction instanceof StoreStaticPropertyOp) ||
      instruction.property !== EXPORTS_PROPERTY_NAME
    ) {
      return false;
    }

    const objectPlace = instruction.object;
    const objectInstr = objectPlace.def!;

    if (!(objectInstr instanceof LoadGlobalOp) || objectInstr.name !== "module") {
      return false;
    }

    return true;
  }

  /**
   * A block is "always executed" iff every path from the function
   * entry to any exit passes through it — equivalently, it dominates
   * every exit block. MLIR-style: walk for return-like terminators
   * (ReturnTermOp, ThrowTermOp) instead of asking the function for a single
   * canonical exit (functions can have multiple).
   *
   * If the function has no exit blocks (infinite loop, all paths
   * Yield/Jump indefinitely), we treat the question as vacuously
   * true: any export assignment that's reached at all is observed
   * before the function leaves.
   */
  private isAlwaysExecutedBlock(blockId: BlockId): boolean {
    const domTree = this.AM.get(DominatorTreeAnalysis, this.funcOp);
    for (const block of this.funcOp.blocks) {
      const term = block.terminal;
      if (!(term instanceof ReturnTermOp || term instanceof ThrowTermOp)) continue;
      if (!domTree.dominates(blockId, block.id)) return false;
    }
    return true;
  }
}
