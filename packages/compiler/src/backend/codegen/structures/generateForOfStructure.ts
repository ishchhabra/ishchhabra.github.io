import * as t from "@babel/types";
import { ForOfOp } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { CodeGenerator } from "../../CodeGenerator";
import { stripTrailingContinue } from "../generateBackEdge";
import { generateBasicBlock } from "../generateBlock";
import { generateOp } from "../ops/generateOp";
import { generateDestructureTarget } from "../ops/memory/generateDestructureTarget";

export function generateForOfStructure(
  structure: ForOfOp,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  // Generate the header block's instructions. This populates the places map
  // and collects any statements (e.g. phi declarations added by SSAEliminator)
  // that need to be emitted inside the loop body.
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

  // Look up the iterable (right side) from the places map.
  const iterable = generator.places.get(structure.iterable.id);
  if (iterable === undefined) {
    throw new Error(`Place ${structure.iterable.id} not found`);
  }
  t.assertExpression(iterable);

  // Generate the body block statements. Prefer the nested region's entry
  // block — step #9's MLIR-style "codegen walks regions" — and fall back
  // to the legacy BlockId field if the region hasn't been populated.
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
  // the for-of construct already loops back to the header.
  stripTrailingContinue(bodyStatements, label);

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

  if (label) {
    return [t.labeledStatement(t.identifier(label), node), ...exitStatements];
  }
  return [node, ...exitStatements];
}
