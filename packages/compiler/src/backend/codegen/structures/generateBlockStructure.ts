import * as t from "@babel/types";
import { BlockStructure } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBasicBlock } from "../generateBlock";

export function generateBlockStructure(
  structure: BlockStructure,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  const headerBlock = functionIR.blocks.get(structure.header);
  if (headerBlock === undefined) {
    throw new Error(`Block ${structure.header} not found`);
  }
  if (headerBlock.instructions.length > 0) {
    throw new Error("BlockStructure header must not contain ordinary instructions");
  }

  // Reserve the exit block so the body's fallthrough jump doesn't inline it
  // inside the explicit block statement.
  generator.generatedBlocks.add(structure.exit);

  const bodyStatements = generateBasicBlock(structure.body, functionIR, generator);

  generator.generatedBlocks.delete(structure.exit);
  const exitPredecessors = functionIR.predecessors.get(structure.exit);
  const exitStatements =
    exitPredecessors && exitPredecessors.size > 0
      ? generateBasicBlock(structure.exit, functionIR, generator)
      : [];

  return [t.blockStatement(bodyStatements), ...exitStatements];
}
