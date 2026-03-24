import * as t from "@babel/types";
import { TernaryStructure } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBasicBlock } from "../generateBlock";
import { generateInstruction } from "../instructions/generateInstruction";

export function generateTernaryStructure(
  structure: TernaryStructure,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  // Generate the header block's instructions (everything before the ternary).
  // This populates the places map with the test value and any preceding
  // instructions (e.g. phi declarations from SSA elimination).
  const headerBlock = functionIR.blocks.get(structure.header);
  if (headerBlock === undefined) {
    throw new Error(`Block ${structure.header} not found`);
  }
  const headerStatements: Array<t.Statement> = [];
  for (const instruction of headerBlock.instructions) {
    headerStatements.push(...generateInstruction(instruction, functionIR, generator));
  }

  // Generate the consequent arm block. All its instructions register
  // expressions in the places map. Since these are expression-only
  // instructions, generateBasicBlock returns no statements — the
  // expressions are inlined when we look up consequentValue below.
  generateBasicBlock(structure.consequent, functionIR, generator);

  // Generate the alternate arm block (same as above).
  generateBasicBlock(structure.alternate, functionIR, generator);

  // Look up the test expression.
  const test = generator.places.get(structure.test.id);
  if (test === undefined) {
    throw new Error(`Place ${structure.test.id} not found`);
  }
  t.assertExpression(test);

  // Look up the consequent value (produced by the consequent arm block).
  const consequent = generator.places.get(structure.consequentValue.id);
  if (consequent === undefined) {
    throw new Error(`Place ${structure.consequentValue.id} not found`);
  }
  t.assertExpression(consequent);

  // Look up the alternate value (produced by the alternate arm block).
  const alternate = generator.places.get(structure.alternateValue.id);
  if (alternate === undefined) {
    throw new Error(`Place ${structure.alternateValue.id} not found`);
  }
  t.assertExpression(alternate);

  // Build the ternary AST node and register it at the result place
  // so downstream instructions that reference this ternary's output
  // can look it up.
  const node = t.conditionalExpression(test, consequent, alternate);
  generator.places.set(structure.resultPlace.id, node);

  // Generate the fallthrough (merge) block.
  const fallthroughStatements = generateBasicBlock(structure.fallthrough, functionIR, generator);

  return [...headerStatements, ...fallthroughStatements];
}
