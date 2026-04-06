import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import {
  BranchTerminal,
  ExpressionStatementInstruction,
  JumpTerminal,
  LiteralInstruction,
  StoreContextInstruction,
  StoreLocalInstruction,
  makeInstructionId,
} from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { instantiateScopeBindings } from "../bindings";
import { buildNode } from "../buildNode";
import { buildAssignmentExpression } from "../expressions/buildAssignmentExpression";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildStatement } from "./buildStatement";

export function buildForStatement(
  node: ESTree.ForStatement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const currentBlock = functionBuilder.currentBlock;

  // Build the init block.
  const initBlock = environment.createBlock();
  functionBuilder.blocks.set(initBlock.id, initBlock);

  functionBuilder.currentBlock = initBlock;
  const init = node.init;
  // If the for-statement has a lexical init, use the for-scope for the entire loop.
  const forScope =
    init?.type === "VariableDeclaration" && (init.kind === "let" || init.kind === "const")
      ? functionBuilder.scopeFor(node)
      : scope;
  if (init != null) {
    if (init.type === "VariableDeclaration") {
      instantiateScopeBindings(node, forScope, functionBuilder, environment, moduleBuilder);
      buildStatement(init, forScope, functionBuilder, moduleBuilder, environment);
    } else {
      // Expression init (e.g. `for (i = 0; ...)`)
      buildExpressionAsStatement(init, scope, functionBuilder, moduleBuilder, environment);
    }
  }
  const initBlockTerminus = functionBuilder.currentBlock;

  // Build the test block.
  const testBlock = environment.createBlock();
  functionBuilder.blocks.set(testBlock.id, testBlock);

  functionBuilder.currentBlock = testBlock;

  let testPlace;
  if (node.test != null) {
    testPlace = buildNode(node.test, forScope, functionBuilder, moduleBuilder, environment);
  } else {
    // If the test is not provided, it is equivalent to while(true).
    const truePlace = environment.createPlace(
      environment.createIdentifier(undefined, scope.allocateName()),
    );
    functionBuilder.addInstruction(
      environment.createInstruction(LiteralInstruction, truePlace, true),
    );
    testPlace = truePlace;
  }
  if (testPlace === undefined || Array.isArray(testPlace)) {
    throw new Error("For statement test place must be a single place");
  }
  const testBlockTerminus = functionBuilder.currentBlock;

  // Build the exit block (created early so break statements can reference it).
  const exitBlock = environment.createBlock();
  functionBuilder.blocks.set(exitBlock.id, exitBlock);

  // Build the body block.
  const bodyBlock = environment.createBlock();
  functionBuilder.blocks.set(bodyBlock.id, bodyBlock);

  const update = node.update;
  const updateBlock = update != null ? environment.createBlock() : undefined;
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
  buildNode(node.body, forScope, functionBuilder, moduleBuilder, environment);
  functionBuilder.controlStack.pop();

  // For `continue`, run the update before the test (ECMAScript for-loop semantics).
  // Normal fall-through from the body also reaches the update when present.
  if (updateBlock !== undefined && update != null) {
    if (functionBuilder.currentBlock.terminal === undefined) {
      functionBuilder.currentBlock.terminal = new JumpTerminal(
        makeInstructionId(functionBuilder.environment.nextInstructionId++),
        updateBlock.id,
      );
    }
    functionBuilder.currentBlock = updateBlock;
    buildExpressionAsStatement(update, forScope, functionBuilder, moduleBuilder, environment);
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
  expression: ESTree.Expression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  // Assignment expressions in for-loop init/update don't need result stabilization.
  if (expression.type === "AssignmentExpression") {
    return buildAssignmentExpression(
      expression,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
      true,
    );
  }

  const expressionPlace = buildNode(expression, scope, functionBuilder, moduleBuilder, environment);
  if (expressionPlace === undefined || Array.isArray(expressionPlace)) {
    throw new Error("Expression place is undefined");
  }

  const expressionInstruction = functionBuilder.environment.placeToInstruction.get(
    expressionPlace.id,
  );

  // Assignments already emit a StoreLocalInstruction; wrapping in
  // ExpressionStatementInstruction would duplicate the declaration in codegen.
  if (
    expressionInstruction instanceof StoreLocalInstruction ||
    expressionInstruction instanceof StoreContextInstruction
  ) {
    return expressionPlace;
  }

  const identifier = environment.createIdentifier(undefined, scope.allocateName());
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ExpressionStatementInstruction,
    place,
    expressionPlace,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
