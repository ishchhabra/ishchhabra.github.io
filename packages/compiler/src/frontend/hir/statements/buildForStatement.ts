import type { Expression, ForStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { BranchTermOp, createOperationId, ForTermOp, JumpTermOp, LiteralOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { instantiateScopeBindings } from "../bindings";
import { buildNode } from "../buildNode";
import { buildAssignmentExpression } from "../expressions/buildAssignmentExpression";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";
import { buildStatement } from "./buildStatement";

/**
 * Lower `for (init; test; update) { body }` to flat CFG:
 *
 *   parentBlock (init ops) --Jump-->  hostBlock (empty landing pad)
 *   hostBlock    --ForTermOp-->       testBlock / bodyBlock / updateBlock / exitBlock
 *   testBlock    (test ops) --BranchTermOp--> bodyBlock / exitBlock
 *   bodyBlock    --Jump-->            updateBlock
 *   updateBlock  (update ops) --Jump--> hostBlock (back-edge; `continue`)
 *
 * `continue` targets updateBlock; `break` targets exitBlock.
 */
export function buildForStatement(
  node: ForStatement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const init = node.init;
  const forScope =
    init?.type === "VariableDeclaration" && (init.kind === "let" || init.kind === "const")
      ? functionBuilder.scopeFor(node)
      : scope;

  const hostBlock = environment.createBlock();
  const testBlock = environment.createBlock();
  const bodyBlock = environment.createBlock();
  const updateBlock = environment.createBlock();
  const exitBlock = environment.createBlock();
  functionBuilder.addBlock(hostBlock);
  functionBuilder.addBlock(testBlock);
  functionBuilder.addBlock(bodyBlock);
  functionBuilder.addBlock(updateBlock);
  functionBuilder.addBlock(exitBlock);

  // Init: runs in the current block (which may change if init is
  // a compound expression).
  if (init != null) {
    if (init.type === "VariableDeclaration") {
      instantiateScopeBindings(node, forScope, functionBuilder, environment, moduleBuilder);
      buildStatement(init, forScope, functionBuilder, moduleBuilder, environment);
    } else {
      buildExpressionAsStatement(init, scope, functionBuilder, moduleBuilder, environment);
    }
  }
  // parentBlock captured AFTER init — compound init may have moved
  // currentBlock to a logical-expression join block.
  const parentBlock = functionBuilder.currentBlock;
  if (parentBlock.terminal === undefined) {
    parentBlock.setTerminal(new JumpTermOp(createOperationId(environment), hostBlock, []));
  }

  hostBlock.setTerminal(
    new ForTermOp(
      createOperationId(environment),
      testBlock,
      bodyBlock,
      updateBlock,
      exitBlock,
      label,
    ),
  );

  // Test block: evaluate cond (or synthesize `true`), branch.
  functionBuilder.currentBlock = testBlock;
  let testPlace;
  if (node.test != null) {
    testPlace = buildNode(node.test, forScope, functionBuilder, moduleBuilder, environment);
  } else {
    const truePlace = environment.createValue();
    functionBuilder.addOp(environment.createOperation(LiteralOp, truePlace, true));
    testPlace = truePlace;
  }
  if (testPlace === undefined || Array.isArray(testPlace)) {
    throw new Error("For statement test place must be a single place");
  }
  functionBuilder.currentBlock.setTerminal(
    new BranchTermOp(createOperationId(environment), testPlace, bodyBlock, exitBlock),
  );

  // Body
  functionBuilder.currentBlock = bodyBlock;
  functionBuilder.controlStack.push({
    kind: "loop",
    label,
    breakTarget: exitBlock.id,
    continueTarget: updateBlock.id,
    structured: false,
  });
  buildOwnedBody(node.body, forScope, functionBuilder, moduleBuilder, environment);
  functionBuilder.controlStack.pop();
  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.setTerminal(
      new JumpTermOp(createOperationId(environment), updateBlock, []),
    );
  }

  // Update
  functionBuilder.currentBlock = updateBlock;
  if (node.update != null) {
    buildExpressionAsStatement(node.update, forScope, functionBuilder, moduleBuilder, environment);
  }
  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.setTerminal(
      new JumpTermOp(createOperationId(environment), hostBlock, []),
    );
  }

  functionBuilder.currentBlock = exitBlock;
  return undefined;
}

function buildExpressionAsStatement(
  expression: Expression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
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
  return expressionPlace;
}
