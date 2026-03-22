import * as t from "@babel/types";
import { ForOfStructure } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBasicBlock } from "../generateBlock";
import { generateInstruction } from "../instructions/generateInstruction";

export function generateForOfStructure(
  structure: ForOfStructure,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  // Generate the header block's instructions. This populates the places map
  // and collects any statements (e.g. phi declarations added by SSAEliminator)
  // that need to be emitted inside the loop body.
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

  // Look up the iterable (right side) from the places map.
  const iterable = generator.places.get(structure.iterable.id);
  if (iterable === undefined) {
    throw new Error(`Place ${structure.iterable.id} not found`);
  }
  t.assertExpression(iterable);

  // Generate the body block statements.
  generator.controlStack.push({ kind: "loop", breakTarget: structure.fallthrough, continueTarget: structure.header });
  const bodyStatements = generateBasicBlock(structure.body, functionIR, generator);
  generator.controlStack.pop();

  // Strip the trailing `continue` that the implicit back-edge produces —
  // the for-of construct already loops back to the header.
  if (bodyStatements.length > 0 && t.isContinueStatement(bodyStatements[bodyStatements.length - 1])) {
    bodyStatements.pop();
  }

  // Generate the fallthrough (exit) block statements.
  const exitStatements = generateBasicBlock(structure.fallthrough, functionIR, generator);

  // Build the for-of AST node.
  // Left side is wrapped in a variable declaration: `const x`
  const left = t.variableDeclaration("const", [t.variableDeclarator(iterationValue)]);
  const right = iterable;
  const node = t.forOfStatement(
    left,
    right,
    t.blockStatement([...headerStatements, ...bodyStatements]),
    structure.isAwait,
  );

  return [node, ...exitStatements];
}
