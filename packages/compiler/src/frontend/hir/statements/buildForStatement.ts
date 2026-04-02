import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import {
  BranchTerminal,
  ExpressionStatementInstruction,
  JumpTerminal,
  StoreContextInstruction,
  StoreLocalInstruction,
  makeInstructionId,
} from "../../../ir";
import { instantiateScopeBindings } from "../bindings";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildStatement } from "./buildStatement";

export function buildForStatement(
  nodePath: NodePath<t.ForStatement>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const currentBlock = functionBuilder.currentBlock;

  // Build the init block.
  const initPath: NodePath<t.ForStatement["init"]> = nodePath.get("init");
  const initBlock = environment.createBlock();
  functionBuilder.blocks.set(initBlock.id, initBlock);

  functionBuilder.currentBlock = initBlock;
  if (initPath.hasNode()) {
    if (initPath.isExpression()) {
      // Build expression inits (e.g. `for (i = 0; ...)`) directly since
      // the statement builder expects a Statement node.
      buildExpressionAsStatement(initPath, functionBuilder, moduleBuilder, environment);
    } else {
      initPath.assertStatement();
      instantiateScopeBindings(nodePath, functionBuilder, environment, moduleBuilder);
      buildStatement(initPath, functionBuilder, moduleBuilder, environment);
    }
  }
  const initBlockTerminus = functionBuilder.currentBlock;

  // Build the test block.
  const testPath: NodePath<t.ForStatement["test"]> = nodePath.get("test");
  const testBlock = environment.createBlock();
  functionBuilder.blocks.set(testBlock.id, testBlock);

  // If the test is not provided, it is equivalent to while(true).
  if (!testPath.hasNode()) {
    testPath.replaceWith(t.valueToNode(true));
  }
  testPath.assertExpression();

  functionBuilder.currentBlock = testBlock;
  const testPlace = buildNode(testPath, functionBuilder, moduleBuilder, environment);
  if (testPlace === undefined || Array.isArray(testPlace)) {
    throw new Error("For statement test place must be a single place");
  }
  const testBlockTerminus = functionBuilder.currentBlock;

  // Build the exit block (created early so break statements can reference it).
  const exitBlock = environment.createBlock();
  functionBuilder.blocks.set(exitBlock.id, exitBlock);

  // Build the body block.
  const bodyPath = nodePath.get("body");
  const bodyBlock = environment.createBlock();
  functionBuilder.blocks.set(bodyBlock.id, bodyBlock);

  const updatePath: NodePath<t.ForStatement["update"]> = nodePath.get("update");
  const updateBlock = updatePath.hasNode() ? environment.createBlock() : undefined;
  if (updateBlock !== undefined) {
    functionBuilder.blocks.set(updateBlock.id, updateBlock);
  }

  functionBuilder.currentBlock = bodyBlock;
  functionBuilder.controlStack.push({
    kind: "loop",
    label,
    breakTarget: exitBlock.id,
    continueTarget: updateBlock?.id ?? testBlock.id,
  });
  if (label) {
    functionBuilder.blockLabels.set(testBlock.id, label);
  }
  buildNode(bodyPath, functionBuilder, moduleBuilder, environment);
  functionBuilder.controlStack.pop();

  // For `continue`, run the update before the test (ECMAScript for-loop semantics).
  // Normal fall-through from the body also reaches the update when present.
  if (updateBlock !== undefined) {
    if (functionBuilder.currentBlock.terminal === undefined) {
      functionBuilder.currentBlock.terminal = new JumpTerminal(
        makeInstructionId(functionBuilder.environment.nextInstructionId++),
        updateBlock.id,
      );
    }
    functionBuilder.currentBlock = updateBlock;
    updatePath.assertExpression();
    buildExpressionAsStatement(updatePath, functionBuilder, moduleBuilder, environment);
  }

  const bodyBlockTerminus = functionBuilder.currentBlock;

  // Set the jump terminal for init block to test block.
  initBlockTerminus.terminal = new JumpTerminal(
    makeInstructionId(functionBuilder.environment.nextInstructionId++),
    testBlock.id,
  );

  // Set the branch terminal for test block.
  testBlockTerminus.terminal = new BranchTerminal(
    makeInstructionId(functionBuilder.environment.nextInstructionId++),
    testPlace,
    bodyBlock.id,
    exitBlock.id,
    exitBlock.id,
  );

  // Set the jump terminal for body block to create a back edge (unless the body
  // already ended with break/return/throw, which owns the terminal).
  if (bodyBlockTerminus.terminal === undefined) {
    bodyBlockTerminus.terminal = new JumpTerminal(
      makeInstructionId(functionBuilder.environment.nextInstructionId++),
      testBlock.id,
    );
  }

  // Set the jump terminal for the current block.
  currentBlock.terminal = new JumpTerminal(
    makeInstructionId(functionBuilder.environment.nextInstructionId++),
    initBlock.id,
  );

  functionBuilder.currentBlock = exitBlock;
  return undefined;
}

function buildExpressionAsStatement(
  expressionPath: NodePath<t.Expression>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const expressionPlace = buildNode(expressionPath, functionBuilder, moduleBuilder, environment);
  if (expressionPlace === undefined || Array.isArray(expressionPlace)) {
    throw new Error("Expression place is undefined");
  }

  const expressionInstruction = functionBuilder.environment.placeToInstruction.get(
    expressionPlace.id,
  );
  if (expressionPath.isAssignmentExpression()) {
    return expressionPlace;
  }

  // Assignments already emit a StoreLocalInstruction; wrapping in
  // ExpressionStatementInstruction would duplicate the declaration in codegen.
  if (
    expressionInstruction instanceof StoreLocalInstruction ||
    expressionInstruction instanceof StoreContextInstruction
  ) {
    return expressionPlace;
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ExpressionStatementInstruction,
    place,
    expressionPath,
    expressionPlace,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
