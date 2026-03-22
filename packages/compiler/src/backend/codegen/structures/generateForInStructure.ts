import * as t from "@babel/types";
import { ForInStructure } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBasicBlock } from "../generateBlock";
import { generateInstruction } from "../instructions/generateInstruction";

export function generateForInStructure(
  structure: ForInStructure,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  // Generate the header block's instructions.
  const headerBlock = functionIR.blocks.get(structure.header);
  if (headerBlock === undefined) {
    throw new Error(`Block ${structure.header} not found`);
  }
  const headerStatements: Array<t.Statement> = [];
  for (const instruction of headerBlock.instructions) {
    headerStatements.push(...generateInstruction(instruction, functionIR, generator));
  }

  // Look up the iteration value (left side) from the places map.
  const iterationValue = generator.places.get(structure.iterationValue.id);
  if (iterationValue === undefined) {
    throw new Error(`Place ${structure.iterationValue.id} not found`);
  }
  t.assertLVal(iterationValue);

  // Look up the object (right side) from the places map.
  const object = generator.places.get(structure.object.id);
  if (object === undefined) {
    throw new Error(`Place ${structure.object.id} not found`);
  }
  t.assertExpression(object);

  // Generate the body block statements.
  generator.controlStack.push({ kind: "loop", breakTarget: structure.fallthrough });
  const bodyStatements = generateBasicBlock(structure.body, functionIR, generator);
  generator.controlStack.pop();

  // Generate the fallthrough (exit) block statements.
  const exitStatements = generateBasicBlock(structure.fallthrough, functionIR, generator);

  // Build the for-in AST node.
  const left = t.variableDeclaration("const", [t.variableDeclarator(iterationValue)]);
  const right = object;
  const node = t.forInStatement(
    left,
    right,
    t.blockStatement([...headerStatements, ...bodyStatements]),
  );

  return [node, ...exitStatements];
}
