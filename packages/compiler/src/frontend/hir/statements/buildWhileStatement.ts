import type { WhileStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { BranchTerminal, createInstructionId, JumpTerminal } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";

export function buildWhileStatement(
  node: WhileStatement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const currentBlock = functionBuilder.currentBlock;
  const scopeId = functionBuilder.lexicalScopeIdFor(scope);

  // Build the test block.
  const testBlock = environment.createBlock(scopeId);
  functionBuilder.blocks.set(testBlock.id, testBlock);

  functionBuilder.currentBlock = testBlock;
  const testPlace = buildNode(node.test, scope, functionBuilder, moduleBuilder, environment);
  if (testPlace === undefined || Array.isArray(testPlace)) {
    throw new Error("While statement test must be a single place");
  }
  const testBlockTerminus = functionBuilder.currentBlock;

  // Build the exit block (created early so break statements can reference it).
  const exitBlock = environment.createBlock(scopeId);
  functionBuilder.blocks.set(exitBlock.id, exitBlock);

  // Build the body block. When the body is a BlockStatement, use its
  // scope so it merges with the body block — the loop syntax provides { }.
  const bodyScope =
    node.body.type === "BlockStatement" ? functionBuilder.scopeFor(node.body) : scope;
  const bodyScopeId = functionBuilder.lexicalScopeIdFor(bodyScope);
  const bodyBlock = environment.createBlock(bodyScopeId);
  functionBuilder.blocks.set(bodyBlock.id, bodyBlock);

  functionBuilder.currentBlock = bodyBlock;
  functionBuilder.controlStack.push({
    kind: "loop",
    label,
    breakTarget: exitBlock.id,
    continueTarget: testBlock.id,
  });
  if (label) {
    functionBuilder.blockLabels.set(testBlock.id, label);
  }
  buildOwnedBody(node.body, scope, functionBuilder, moduleBuilder, environment);
  functionBuilder.controlStack.pop();
  const bodyBlockTerminus = functionBuilder.currentBlock;

  // Set the branch terminal for the test block.
  testBlockTerminus.terminal = new BranchTerminal(
    createInstructionId(functionBuilder.environment),
    testPlace,
    bodyBlock.id,
    exitBlock.id,
    exitBlock.id,
  );

  // Set the jump terminal for body block to create a back edge (unless the body
  // already ended with break/return/throw, which owns the terminal).
  if (bodyBlockTerminus.terminal === undefined) {
    bodyBlockTerminus.terminal = new JumpTerminal(
      createInstructionId(functionBuilder.environment),
      testBlock.id,
    );
  }

  // Set the jump terminal for the current block.
  currentBlock.terminal = new JumpTerminal(
    createInstructionId(functionBuilder.environment),
    testBlock.id,
  );

  functionBuilder.currentBlock = exitBlock;
  return undefined;
}
