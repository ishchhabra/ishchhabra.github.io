import * as t from "@babel/types";
import { LabeledBlockStructure } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBasicBlock } from "../generateBlock";

export function generateLabeledBlockStructure(
  structure: LabeledBlockStructure,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  // Reserve the fallthrough (exit) block so that JumpTerminals inside
  // the body emit `break label` instead of inlining the exit block.
  generator.generatedBlocks.add(structure.fallthrough);

  generator.controlStack.push({
    kind: "label",
    label: structure.label,
    breakTarget: structure.fallthrough,
  });
  const bodyStatements = generateBasicBlock(structure.body, functionIR, generator);
  generator.controlStack.pop();

  // Strip trailing `break label` that represents the natural block exit.
  if (bodyStatements.length > 0) {
    const last = bodyStatements[bodyStatements.length - 1];
    if (
      t.isBreakStatement(last) &&
      last.label &&
      last.label.name === structure.label
    ) {
      bodyStatements.pop();
    }
  }

  // Unreserve and generate the exit block.
  generator.generatedBlocks.delete(structure.fallthrough);
  const exitStatements = generateBasicBlock(structure.fallthrough, functionIR, generator);

  const blockStmt = t.blockStatement(bodyStatements);
  const labeledStmt = t.labeledStatement(t.identifier(structure.label), blockStmt);

  return [labeledStmt, ...exitStatements];
}
