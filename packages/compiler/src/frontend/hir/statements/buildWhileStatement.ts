import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { BranchTerminal, createInstructionId, JumpTerminal } from "../../../ir";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildWhileStatement(
  nodePath: NodePath<t.WhileStatement>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const currentBlock = functionBuilder.currentBlock;

  // Build the test block.
  const testPath = nodePath.get("test");
  const testBlock = environment.createBlock();
  functionBuilder.blocks.set(testBlock.id, testBlock);

  functionBuilder.currentBlock = testBlock;
  const testPlace = buildNode(testPath, functionBuilder, moduleBuilder, environment);
  if (testPlace === undefined || Array.isArray(testPlace)) {
    throw new Error("While statement test must be a single place");
  }
  const testBlockTerminus = functionBuilder.currentBlock;

  // Build the exit block (created early so break statements can reference it).
  const exitBlock = environment.createBlock();
  functionBuilder.blocks.set(exitBlock.id, exitBlock);

  // Build the body block.
  const bodyPath = nodePath.get("body");
  const bodyBlock = environment.createBlock();
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
  buildNode(bodyPath, functionBuilder, moduleBuilder, environment);
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
