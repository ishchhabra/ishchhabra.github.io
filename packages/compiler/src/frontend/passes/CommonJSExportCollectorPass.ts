import { Operation, BlockId, LoadGlobalOp } from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { ModuleIR } from "../../ir/core/ModuleIR";
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
    private readonly functionIR: FunctionIR,
    private readonly moduleIR: ModuleIR,
    private readonly AM: AnalysisManager,
  ) {}

  public run() {
    for (const block of this.functionIR.allBlocks()) {
      const blockId = block.id;
      if (!this.isAlwaysExecutedBlock(blockId)) {
        continue;
      }

      for (const instruction of block.operations) {
        if (!this.isModuleExportInstruction(instruction)) {
          continue;
        }

        const declarationId = instruction.value.identifier.declarationId;
        const declarationInstructionId = this.moduleIR.environment.getDeclarationOp(declarationId)!;
        this.moduleIR.exports.set("default", {
          instruction,
          declaration: this.moduleIR.environment.operations.get(declarationInstructionId)!,
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
    const objectInstr = this.moduleIR.environment.placeToOp.get(objectPlace.id)!;

    if (!(objectInstr instanceof LoadGlobalOp) || objectInstr.name !== "module") {
      return false;
    }

    return true;
  }

  private isAlwaysExecutedBlock(blockId: BlockId) {
    const exitBlockId = this.functionIR.exitBlockId;
    const domTree = this.AM.get(DominatorTreeAnalysis, this.functionIR);
    return domTree.dominates(blockId, exitBlockId);
  }
}
