import type { Expression, ForStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { ConditionOp, createOperationId, ForOp, LiteralOp, Region, YieldOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { instantiateScopeBindings } from "../bindings";
import { buildNode } from "../buildNode";
import { buildAssignmentExpression } from "../expressions/buildAssignmentExpression";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";
import { buildStatement } from "./buildStatement";

/**
 * Lower `for (init; test; update) { body }` to a structured
 * {@link ForOp}.
 *
 *   parentBlock: [..., ForOp, ...]
 *     ForOp.initRegion:   [initBlock]
 *       initBlock:   [...init ops...,   YieldOp]
 *     ForOp.beforeRegion: [beforeBlock]
 *       beforeBlock: [...test ops...,   ConditionOp(test_result)]
 *     ForOp.bodyRegion:   [bodyBlock]
 *       bodyBlock:   [...body ops...,   YieldOp]
 *     ForOp.updateRegion: [updateBlock]
 *       updateBlock: [...update ops..., YieldOp]
 *
 * Every region is always present so ForOp's four-region invariant
 * holds. An absent slot is a YieldOp-only block. Keeping init in
 * its own region (rather than inline in the parent block) makes the
 * ForOp self-contained: passes walking its regions see the full
 * control flow, and codegen emits the init as the for-statement's
 * init slot rather than as statements preceding the loop.
 *
 * JS `continue` inside the body must run the update expression
 * before re-evaluating the test, so update is its own region —
 * collapsing it into the body would break `continue` semantics.
 */
export function buildForStatement(
  node: ForStatement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const parentBlock = functionBuilder.currentBlock;

  const init = node.init;
  const forScope =
    init?.type === "VariableDeclaration" && (init.kind === "let" || init.kind === "const")
      ? functionBuilder.scopeFor(node)
      : scope;

  // Init region: runs once before the first iteration. Empty when
  // the source omits the init clause.
  const initRegion = new Region([]);
  const initBlock = environment.createBlock();
  functionBuilder.withStructureRegion(initRegion, () => {
    functionBuilder.addBlock(initBlock);
    functionBuilder.currentBlock = initBlock;
    if (init != null) {
      if (init.type === "VariableDeclaration") {
        instantiateScopeBindings(node, forScope, functionBuilder, environment, moduleBuilder);
        buildStatement(init, forScope, functionBuilder, moduleBuilder, environment);
      } else {
        buildExpressionAsStatement(init, scope, functionBuilder, moduleBuilder, environment);
      }
    }
    if (functionBuilder.currentBlock.terminal === undefined) {
      functionBuilder.currentBlock.terminal = new YieldOp(createOperationId(environment), []);
    }
  });

  // Before region: test ops + ConditionOp. If the source omits a
  // test (`for (;;) {}`), the test defaults to literal `true`.
  const beforeRegion = new Region([]);
  const beforeBlock = environment.createBlock();
  functionBuilder.withStructureRegion(beforeRegion, () => {
    functionBuilder.addBlock(beforeBlock);
    functionBuilder.currentBlock = beforeBlock;
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
    functionBuilder.currentBlock.terminal = new ConditionOp(
      createOperationId(environment),
      testPlace,
    );
  });

  const bodyRegion = new Region([]);
  const bodyBlock = environment.createBlock();
  functionBuilder.withStructureRegion(bodyRegion, () => {
    functionBuilder.addBlock(bodyBlock);
    functionBuilder.currentBlock = bodyBlock;
    functionBuilder.controlStack.push({
      kind: "loop",
      label,
      breakTarget: undefined,
      continueTarget: undefined,
      structured: true,
    });
    buildOwnedBody(node.body, forScope, functionBuilder, moduleBuilder, environment);
    functionBuilder.controlStack.pop();
    if (functionBuilder.currentBlock.terminal === undefined) {
      functionBuilder.currentBlock.terminal = new YieldOp(createOperationId(environment), []);
    }
  });

  // Update region: always present (even when the source omits the
  // update expression) so ForOp's four-region invariant holds.
  const updateRegion = new Region([]);
  const updateBlock = environment.createBlock();
  functionBuilder.withStructureRegion(updateRegion, () => {
    functionBuilder.addBlock(updateBlock);
    functionBuilder.currentBlock = updateBlock;
    if (node.update != null) {
      buildExpressionAsStatement(
        node.update,
        forScope,
        functionBuilder,
        moduleBuilder,
        environment,
      );
    }
    if (functionBuilder.currentBlock.terminal === undefined) {
      functionBuilder.currentBlock.terminal = new YieldOp(createOperationId(environment), []);
    }
  });

  const forOp = new ForOp(
    createOperationId(environment),
    initRegion,
    beforeRegion,
    bodyRegion,
    updateRegion,
    label,
  );
  parentBlock.appendOp(forOp);
  functionBuilder.currentBlock = parentBlock;
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
