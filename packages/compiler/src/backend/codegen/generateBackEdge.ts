import { BranchTerminal, JumpTerminal } from "../../ir";

import * as t from "@babel/types";
import { BlockId } from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { CodeGenerator } from "../CodeGenerator";
import { generateBasicBlock } from "./generateBlock";

export function generateBackEdge(
  blockId: BlockId,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  const terminal = functionIR.blocks.get(blockId)!.terminal!;

  if (terminal instanceof JumpTerminal) {
    return generateJumpBackEdge(terminal, blockId, functionIR, generator);
  }

  if (terminal instanceof BranchTerminal) {
    return generateBranchBackEdge(terminal, blockId, functionIR, generator);
  }

  throw new Error(`Unsupported back edge on block ${blockId} (${terminal.constructor.name})`);
}

/**
 * A JumpTerminal back edge is an unconditional loop: while (true) { ... }
 *
 * This occurs when ConstantPropagationPass folds a loop condition that is
 * always true, replacing BranchTerminal(true, body, exit) with
 * JumpTerminal(body).
 */
function generateJumpBackEdge(
  terminal: JumpTerminal,
  headerBlockId: BlockId,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  generator.controlStack.push({ kind: "loop", breakTarget: headerBlockId, continueTarget: headerBlockId });
  const bodyInstructions = generateBasicBlock(terminal.target, functionIR, generator);
  generator.controlStack.pop();

  // Strip the trailing `continue` that the implicit back-edge produces.
  if (bodyInstructions.length > 0 && t.isContinueStatement(bodyInstructions[bodyInstructions.length - 1])) {
    bodyInstructions.pop();
  }

  const node = t.whileStatement(t.booleanLiteral(true), t.blockStatement(bodyInstructions));
  return [node];
}

function generateBranchBackEdge(
  terminal: BranchTerminal,
  headerBlockId: BlockId,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  const test = generator.places.get(terminal.test.id);
  if (test === undefined) {
    throw new Error(`Place ${terminal.test.id} not found`);
  }

  t.assertExpression(test);

  generator.controlStack.push({ kind: "loop", breakTarget: terminal.fallthrough, continueTarget: headerBlockId });
  const bodyInstructions = generateBasicBlock(terminal.consequent, functionIR, generator);
  generator.controlStack.pop();

  // Strip the trailing `continue` that the implicit back-edge produces —
  // the while construct already loops back to the header.
  if (bodyInstructions.length > 0 && t.isContinueStatement(bodyInstructions[bodyInstructions.length - 1])) {
    bodyInstructions.pop();
  }

  const exitInstructions = generateBasicBlock(terminal.fallthrough, functionIR, generator);

  const node = t.whileStatement(test, t.blockStatement(bodyInstructions));
  return [node, ...exitInstructions];
}
