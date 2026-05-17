import type { ConditionalExpression } from "oxc-parser";

import { blockTarget } from "../../ir/core/TerminatorOp";
import type { Value } from "../../ir/core/Value";
import { ConditionalTerminatorOp } from "../../ir/ops/control/ConditionalTerminatorOp";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerExpression } from "./lowerExpression";

/**
 * Lowers an ECMAScript conditional expression.
 *
 * The test is evaluated first. Only the selected arm is evaluated, and both
 * arms forward their produced value to a join block parameter.
 *
 * @example
 * ```js
 * const value = condition ? consequent : alternate;
 * ```
 */
export function lowerConditionalExpression(
  builder: FunctionIRBuilder,
  expression: ConditionalExpression,
): Value {
  const test = lowerExpression(builder, expression.test);

  const consequentBlock = builder.createBlock();
  const alternateBlock = builder.createBlock();
  const joinBlock = builder.createBlock();

  const result = builder.createValue();
  joinBlock.appendParam(result);

  builder.terminate(
    new ConditionalTerminatorOp(
      builder.operationId(),
      test,
      blockTarget(consequentBlock),
      blockTarget(alternateBlock),
      blockTarget(joinBlock),
    ),
  );

  builder.setCurrentBlock(consequentBlock);
  const consequent = lowerExpression(builder, expression.consequent);
  if (!builder.currentBlock.isTerminated) {
    builder.terminate(
      new JumpTerminatorOp(builder.operationId(), blockTarget(joinBlock, [consequent])),
    );
  }

  builder.setCurrentBlock(alternateBlock);
  const alternate = lowerExpression(builder, expression.alternate);
  if (!builder.currentBlock.isTerminated) {
    builder.terminate(
      new JumpTerminatorOp(builder.operationId(), blockTarget(joinBlock, [alternate])),
    );
  }

  builder.setCurrentBlock(joinBlock);
  return result;
}
