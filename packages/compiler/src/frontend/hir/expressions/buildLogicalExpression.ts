import type { LogicalExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import {
  BasicBlock,
  BinaryExpressionOp,
  createOperationId,
  IfTermOp,
  JumpTermOp,
  LiteralOp,
  Value,
} from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

/**
 * Lower `&&` / `||` / `??` to CFG short-circuit control flow:
 *
 *   a && b  →  if a { jump join(b) } else { jump join(a) }
 *   a || b  →  if a { jump join(a) } else { jump join(b) }
 *   a ?? b  →  if a != null { jump join(a) } else { jump join(b) }
 *
 * `??` uses loose `!= null` (matches both null and undefined via
 * JS's `null == undefined` rule). Strict `!==` would leave undefined
 * broken: `undefined ?? 5` must return 5, not undefined.
 *
 * The short-circuit result flows through a block param on the join
 * block. The returned {@link Value} is that block param — the
 * caller reads it as the expression's value.
 */
export function buildLogicalExpression(
  node: LogicalExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value {
  const leftPlace = buildNode(node.left, scope, functionBuilder, moduleBuilder, environment);
  if (leftPlace === undefined || Array.isArray(leftPlace)) {
    throw new Error("Logical expression left must be a single place");
  }

  const testPlace = buildTestPlace(node.operator, leftPlace, functionBuilder, environment);
  // parentBlock must be captured AFTER the LHS evaluates — compound
  // LHS may have moved currentBlock to a join block.
  const parentBlock = functionBuilder.currentBlock;

  const truthyBlock = environment.createBlock();
  const falsyBlock = environment.createBlock();
  const joinBlock = environment.createBlock();
  const resultPlace = environment.createValue();
  joinBlock.params = [resultPlace];
  functionBuilder.addBlock(truthyBlock);
  functionBuilder.addBlock(falsyBlock);
  functionBuilder.addBlock(joinBlock);

  parentBlock.setTerminal(
    new IfTermOp(
      createOperationId(environment),
      testPlace,
      { block: truthyBlock, args: [] },
      { block: falsyBlock, args: [] },
      joinBlock,
    ),
  );

  // Arm semantics per operator
  switch (node.operator) {
    case "&&":
      // truthy → eval RHS and pass; falsy → pass LHS
      buildRhsArm(
        node.right,
        truthyBlock,
        joinBlock,
        scope,
        functionBuilder,
        moduleBuilder,
        environment,
      );
      buildPassthroughArm(leftPlace, falsyBlock, joinBlock, functionBuilder, environment);
      break;
    case "||":
      // truthy → pass LHS; falsy → eval RHS
      buildPassthroughArm(leftPlace, truthyBlock, joinBlock, functionBuilder, environment);
      buildRhsArm(
        node.right,
        falsyBlock,
        joinBlock,
        scope,
        functionBuilder,
        moduleBuilder,
        environment,
      );
      break;
    case "??":
      // lhs != null (truthy) → pass LHS; nullish (falsy) → eval RHS
      buildPassthroughArm(leftPlace, truthyBlock, joinBlock, functionBuilder, environment);
      buildRhsArm(
        node.right,
        falsyBlock,
        joinBlock,
        scope,
        functionBuilder,
        moduleBuilder,
        environment,
      );
      break;
    default: {
      const exhaustive: never = node.operator;
      throw new Error(`Unsupported logical operator: ${String(exhaustive)}`);
    }
  }

  functionBuilder.currentBlock = joinBlock;
  return resultPlace;
}

function buildTestPlace(
  operator: LogicalExpression["operator"],
  leftPlace: Value,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): Value {
  if (operator !== "??") return leftPlace;

  const nullPlace = environment.createValue();
  functionBuilder.addOp(environment.createOperation(LiteralOp, nullPlace, null));

  const testPlace = environment.createValue();
  functionBuilder.addOp(
    environment.createOperation(BinaryExpressionOp, testPlace, "!=", leftPlace, nullPlace),
  );
  return testPlace;
}

function buildRhsArm(
  right: LogicalExpression["right"],
  armBlock: BasicBlock,
  joinBlock: BasicBlock,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): void {
  functionBuilder.currentBlock = armBlock;
  const place = buildNode(right, scope, functionBuilder, moduleBuilder, environment);
  if (place === undefined || Array.isArray(place)) {
    throw new Error("Logical expression right must be a single place");
  }
  // The RHS may have self-terminated (a `return` / `throw` / nested
  // structured construct that set the current block's terminal).
  // Only emit our join-jump when the RHS didn't already end the arm.
  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.setTerminal(
      new JumpTermOp(createOperationId(environment), joinBlock, [place]),
    );
  }
}

function buildPassthroughArm(
  leftPlace: Value,
  armBlock: BasicBlock,
  joinBlock: BasicBlock,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): void {
  functionBuilder.currentBlock = armBlock;
  // Passthrough arm: the block is freshly allocated and no code was
  // emitted into it — terminator must not already be set. The
  // `setTerminal` helper asserts this, catching any future refactor
  // that changes the construction order.
  armBlock.setTerminal(new JumpTermOp(createOperationId(environment), joinBlock, [leftPlace]));
}
