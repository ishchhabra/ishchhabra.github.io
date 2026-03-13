import * as t from "@babel/types";
import { ForOfTerminal } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBlock } from "../generateBlock";

export function generateForOfTerminal(
  terminal: ForOfTerminal,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  // Reserve the fallthrough block so body generation doesn't pull it in.
  generator.generatedBlocks.add(terminal.fallthrough);

  // Get the left node. This is the StoreLocal's output — a VariableDeclaration
  // (e.g., `const item`) or a binding identifier for bare assignments.
  const leftNode = generator.places.get(terminal.left.id);
  if (leftNode === undefined) {
    throw new Error(`Place ${terminal.left.id} not found for ForOf left`);
  }

  // The left side can be a VariableDeclaration (from StoreLocal codegen)
  // or an LVal (bare identifier assignment like `for (item of items)`).
  let left: t.VariableDeclaration | t.LVal;
  if (t.isVariableDeclaration(leftNode)) {
    // Strip the initializer — for-of declarations must not have one.
    // The StoreLocal codegen sets `const x = undefined` but the for-of
    // construct provides the value from the iterator.
    for (const decl of leftNode.declarations) {
      decl.init = null;
    }
    left = leftNode;
  } else {
    t.assertLVal(leftNode);
    left = leftNode;
  }

  // Get the right (iterable) node.
  const rightNode = generator.places.get(terminal.right.id);
  if (rightNode === undefined) {
    throw new Error(`Place ${terminal.right.id} not found for ForOf right`);
  }
  t.assertExpression(rightNode);

  // Generate the body block.
  const bodyStatements = generateBlock(terminal.body, functionIR, generator);

  // Generate the fallthrough block.
  generator.generatedBlocks.delete(terminal.fallthrough);
  const fallthroughStatements = generateBlock(terminal.fallthrough, functionIR, generator);

  const forOfNode = t.forOfStatement(
    left,
    rightNode,
    t.blockStatement(bodyStatements),
    terminal.isAwait,
  );

  return [forOfNode, ...fallthroughStatements];
}
