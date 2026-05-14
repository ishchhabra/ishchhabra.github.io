import type { LogicalExpression } from "oxc-parser";
import { blockTarget } from "../../ir/core/TerminatorOp";
import type { Value } from "../../ir/core/Value";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { ShortCircuitTerminatorOp } from "../../ir/ops/control/ShortCircuitTerminatorOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerExpression } from "./lowerExpression";

/**
 * Lowers short-circuiting logical expressions to structured value control flow.
 *
 * The result is represented as a block parameter on the join block. The right
 * side is lowered only in the branch where ECMAScript requires evaluation.
 */
export function lowerLogicalExpression(
  builder: FunctionIRBuilder,
  expression: LogicalExpression,
): Value {
  const left = lowerExpression(builder, expression.left);

  const rhsBlock = builder.createBlock();
  const joinBlock = builder.createBlock();
  const result = builder.createValue();
  joinBlock.appendParam(result);

  builder.terminate(
    new ShortCircuitTerminatorOp(
      builder.operationId(),
      expression.operator,
      left,
      blockTarget(rhsBlock),
      blockTarget(joinBlock, [left]),
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
