import * as t from "@babel/types";
import { ForInOp } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { CodeGenerator } from "../../CodeGenerator";
import { stripTrailingContinue } from "../generateBackEdge";
import { generateBasicBlock } from "../generateBlock";
import { generateOp } from "../ops/generateOp";
import { generateDestructureTarget } from "../ops/memory/generateDestructureTarget";

export function generateForInStructure(
  structure: ForInOp,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  // Generate the header block's instructions.
  const headerBlock = functionIR.maybeBlock(structure.header);
  if (headerBlock === undefined) {
    throw new Error(`Block ${structure.header} not found`);
  }
  const headerStatements: Array<t.Statement> = [];
  for (const instruction of headerBlock.operations) {
    headerStatements.push(...generateOp(instruction, functionIR, generator));
  }

  const iterationValue = generateDestructureTarget(structure.iterationTarget, generator);
  t.assertLVal(iterationValue);

  // Look up the object (right side) from the places map.
  const object = generator.places.get(structure.object.id);
  if (object === undefined) {
    throw new Error(`Place ${structure.object.id} not found`);
  }
  t.assertExpression(object);

  // Generate the body block statements via the nested region (step #9).
  const label = structure.label;
  generator.controlStack.push({
    kind: "loop",
    label,
    breakTarget: structure.fallthrough,
    continueTarget: structure.header,
  });
  const bodyEntryId = structure.regions[0]?.entry.id ?? structure.body;
  const bodyStatements = generateBasicBlock(bodyEntryId, functionIR, generator);
  generator.controlStack.pop();

  // Strip the trailing `continue` that the implicit back-edge produces —
  // the for-in construct already loops back to the header.
  stripTrailingContinue(bodyStatements, label);

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

  if (label) {
    return [t.labeledStatement(t.identifier(label), node), ...exitStatements];
  }
  return [node, ...exitStatements];
}
