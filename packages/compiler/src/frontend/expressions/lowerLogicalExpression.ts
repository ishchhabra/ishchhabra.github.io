import type { LogicalExpression } from "oxc-parser";
import { blockTarget } from "../../ir/core/TerminatorOp";
import type { Value } from "../../ir/core/Value";
import { IfTerminatorOp } from "../../ir/ops/control/IfTerminatorOp";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { ConstantOp } from "../../ir/ops/constants/ConstantOp";
import { BinaryOp } from "../../ir/ops/operators/BinaryOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerExpression } from "./lowerExpression";

/**
 * Lowers short-circuiting logical expressions to control flow.
 *
 * The result is represented as a block parameter on the join block. The right
 * side is lowered only in the branch where ECMAScript requires evaluation.
 */
export function lowerLogicalExpression(
  builder: FunctionIRBuilder,
  expression: LogicalExpression,
): Value {
  const left = lowerExpression(builder, expression.left);
  const condition = branchCondition(builder, expression.operator, left);

  const rhsBlock = builder.createBlock();
  const joinBlock = builder.createBlock();
  const result = builder.createValue();
  joinBlock.appendParam(result);

  const rhsTarget = blockTarget(rhsBlock);
  const passTarget = blockTarget(joinBlock, [left]);

  builder.terminate(
    new IfTerminatorOp(
      builder.operationId(),
      condition,
      expression.operator === "&&" ? rhsTarget : passTarget,
      expression.operator === "&&" ? passTarget : rhsTarget,
      joinBlock,
    ),
  );

  builder.setCurrentBlock(rhsBlock);
  const right = lowerExpression(builder, expression.right);
  if (!builder.currentBlock.isTerminated) {
    builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(joinBlock, [right])));
  }

  builder.setCurrentBlock(joinBlock);
  return result;
}

function branchCondition(
  builder: FunctionIRBuilder,
  operator: LogicalExpression["operator"],
  left: Value,
): Value {
  if (operator !== "??") return left;

  const nullValue = builder.createValue();
  builder.emit(new ConstantOp(builder.operationId(), null, nullValue));

  const condition = builder.createValue();
  builder.emit(new BinaryOp(builder.operationId(), "!=", left, nullValue, condition));
  return condition;
}
