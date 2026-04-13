import { BranchOp, JumpOp } from "../../ir";

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
  const terminal = functionIR.getBlock(blockId).terminal!;

  if (terminal instanceof JumpOp) {
    return generateJumpBackEdge(terminal, blockId, functionIR, generator);
  }

  if (terminal instanceof BranchOp) {
    return generateBranchBackEdge(terminal, blockId, functionIR, generator);
  }

  throw new Error(`Unsupported back edge on block ${blockId} (${terminal.constructor.name})`);
}

/**
 * A JumpOp back edge is an unconditional loop: while (true) { ... }
 *
 * This occurs when ConstantPropagationPass folds a loop condition that is
 * always true, replacing BranchOp(true, body, exit) with
 * JumpOp(body).
 */
function generateJumpBackEdge(
  terminal: JumpOp,
  headerBlockId: BlockId,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  const label = functionIR.blockLabels.get(headerBlockId);
  generator.controlStack.push({
    kind: "loop",
    label,
    breakTarget: headerBlockId,
    continueTarget: headerBlockId,
  });
  const bodyInstructions = generateBasicBlock(terminal.target, functionIR, generator);
  generator.controlStack.pop();

  // Strip the trailing `continue` that the implicit back-edge produces.
  stripTrailingContinue(bodyInstructions, label);

  const node: t.Statement = t.whileStatement(
    t.booleanLiteral(true),
    t.blockStatement(bodyInstructions),
  );
  if (label) {
    return [t.labeledStatement(t.identifier(label), node)];
  }
  return [node];
}

function generateBranchBackEdge(
  terminal: BranchOp,
  headerBlockId: BlockId,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  const test = generator.places.get(terminal.test.id);
  if (test === undefined) {
    throw new Error(`Place ${terminal.test.id} not found`);
  }

  t.assertExpression(test);

  const label = functionIR.blockLabels.get(headerBlockId);
  generator.controlStack.push({
    kind: "loop",
    label,
    breakTarget: terminal.fallthrough,
    continueTarget: headerBlockId,
  });
  const bodyInstructions = generateBasicBlock(terminal.consequent, functionIR, generator);
  generator.controlStack.pop();

  // Strip the trailing `continue` that the implicit back-edge produces —
  // the while construct already loops back to the header.
  stripTrailingContinue(bodyInstructions, label);

  const exitInstructions = generateBasicBlock(terminal.fallthrough, functionIR, generator);

  const node: t.Statement = t.whileStatement(test, t.blockStatement(bodyInstructions));
  if (label) {
    return [t.labeledStatement(t.identifier(label), node), ...exitInstructions];
  }
  return [node, ...exitInstructions];
}

/**
 * Strips a trailing `continue` if it targets this loop: either unlabeled
 * (always targets the innermost loop) or labeled with this loop's label.
 */
export function stripTrailingContinue(statements: t.Statement[], loopLabel?: string): void {
  if (statements.length === 0) return;
  const last = statements[statements.length - 1];
  if (!t.isContinueStatement(last)) return;
  if (!last.label || last.label.name === loopLabel) {
    statements.pop();
  }
}
