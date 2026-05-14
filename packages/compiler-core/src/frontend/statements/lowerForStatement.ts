import { ForStatement } from "oxc-parser";

import { blockTarget } from "../../ir/core/TerminatorOp";
import { Value } from "../../ir/core/Value";
import { ConstantOp } from "../../ir/ops/constants/ConstantOp";
import { BranchTerminatorOp } from "../../ir/ops/control/BranchTerminatorOp";
import { ForTerminatorOp } from "../../ir/ops/control/ForTerminatorOp";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { lowerExpression } from "../expressions/lowerExpression";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerExpressionStatement } from "./lowerExpressionStatement";
import { StatementLoweringOptions } from "./loweringOptions";
import { lowerStatement } from "./lowerStatement";
import { lowerVariableDeclaration } from "./lowerVariableDeclaration";

/**
 * Lowers a for loop to explicit control flow with a structured loop owner.
 *
 * The initializer runs before the loop host. The host enters the test block.
 * The test branches to body or exit. A normally completing body jumps to the
 * update block, and a normally completing update jumps back to the host.
 */
export function lowerForStatement(
  builder: FunctionIRBuilder,
  statement: ForStatement,
  options: StatementLoweringOptions = {},
): void {
  if (statement.init !== null) {
    if (statement.init.type === "VariableDeclaration") {
      lowerVariableDeclaration(builder, statement.init);
    } else {
      lowerExpressionStatement(builder, statement.init);
    }
  }

  const loopBlock = builder.createBlock();
  const testBlock = builder.createBlock();
  const bodyBlock = builder.createBlock();
  const updateBlock = builder.createBlock();
  const completionBlock = builder.createBlock();

  const control = {
    kind: "loop" as const,
    label: options.label ?? null,
    breakTarget: completionBlock,
    continueTarget: updateBlock,
  };

  builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(loopBlock)));

  builder.setCurrentBlock(loopBlock);
  builder.terminate(
    new ForTerminatorOp(
      builder.operationId(),
      blockTarget(testBlock),
      bodyBlock,
      updateBlock,
      completionBlock,
      options.label ?? null,
    ),
  );

  builder.setCurrentBlock(testBlock);
  const condition =
    statement.test === null
      ? emitBooleanConstant(builder, true)
      : lowerExpression(builder, statement.test);

  builder.terminate(
    new BranchTerminatorOp(
      builder.operationId(),
      condition,
      blockTarget(bodyBlock),
      blockTarget(completionBlock),
    ),
  );

  builder.pushControl(control);
  try {
    builder.setCurrentBlock(bodyBlock);
    lowerStatement(builder, statement.body);
  } finally {
    builder.popControl(control);
  }

  if (!builder.currentBlock.isTerminated) {
    builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(updateBlock)));
  }

  builder.setCurrentBlock(updateBlock);
  if (statement.update !== null) {
    lowerExpressionStatement(builder, statement.update);
  }
  if (!builder.currentBlock.isTerminated) {
    builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(loopBlock)));
  }

  builder.setCurrentBlock(completionBlock);
}

function emitBooleanConstant(builder: FunctionIRBuilder, value: boolean): Value {
  const result = builder.createValue();
  builder.emit(new ConstantOp(builder.operationId(), value, result));
  return result;
}
