import * as t from "@babel/types";
import { BlockOp } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { ControlFlowGraphAnalysis } from "../../../pipeline/analysis/ControlFlowGraphAnalysis";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBasicBlock } from "../generateBlock";

export function generateBlockStructure(
  structure: BlockOp,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  const headerBlock = functionIR.maybeBlock(structure.header);
  if (headerBlock === undefined) {
    throw new Error(`Block ${structure.header} not found`);
  }
  if (headerBlock.operations.length > 0) {
    throw new Error("BlockOp header must not contain ordinary instructions");
  }

  // Reserve the exit block so the body's fallthrough jump doesn't inline it
  // inside the explicit block statement.
  generator.generatedBlocks.add(structure.exit);

  // Walk the nested region (step #9) with fallback to the legacy BlockId.
  const bodyEntryId = structure.regions[0]?.entry.id ?? structure.body;
  const bodyStatements = generateBasicBlock(bodyEntryId, functionIR, generator);

  generator.generatedBlocks.delete(structure.exit);
  const exitPredecessors = generator.analysisManager
    .get(ControlFlowGraphAnalysis, functionIR)
    .predecessors.get(structure.exit);
  const exitStatements =
    exitPredecessors && exitPredecessors.size > 0
      ? generateBasicBlock(structure.exit, functionIR, generator)
      : [];

  return [t.blockStatement(bodyStatements), ...exitStatements];
}
