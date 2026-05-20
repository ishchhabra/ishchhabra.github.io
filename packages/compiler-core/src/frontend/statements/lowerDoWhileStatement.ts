import { DoWhileStatement } from "oxc-parser";

import { blockTarget } from "../../ir/core/TerminatorOp";
import { BranchTerminatorOp } from "../../ir/ops/control/BranchTerminatorOp";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { WhileTerminatorOp } from "../../ir/ops/control/WhileTerminatorOp";
import { lowerExpression } from "../expressions/lowerExpression";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { StatementLoweringOptions } from "./loweringOptions";
import { lowerStatement } from "./lowerStatement";

/**
 * Lowers a do-while loop to explicit control flow with a structured loop owner.
 *
 * The body executes before the first test. A non-terminating body jumps to the
 * test block, and the test branches back to the body or out to the exit block.
 */
export function lowerDoWhileStatement(
  builder: FunctionIRBuilder,
  statement: DoWhileStatement,
  options: StatementLoweringOptions = {},
): void {
  const loopBlock = builder.createBlock();
  const testBlock = builder.createBlock();
  const bodyBlock = builder.createBlock();
  const exitBlock = builder.createBlock();

  const control = {
    kind: "loop" as const,
    label: options.label ?? null,
    breakTarget: exitBlock,
    continueTarget: blockTarget(testBlock),
  };

  builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(loopBlock)));

  builder.setCurrentBlock(loopBlock);
  builder.terminate(
    new WhileTerminatorOp(
      builder.operationId(),
      blockTarget(testBlock),
      blockTarget(bodyBlock),
      blockTarget(exitBlock),
      "do-while",
      options.label ?? null,
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
    builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(testBlock)));
  }

  builder.setCurrentBlock(testBlock);
  const condition = lowerExpression(builder, statement.test);
  builder.terminate(
    new BranchTerminatorOp(
      builder.operationId(),
      condition,
      blockTarget(loopBlock),
      blockTarget(exitBlock),
    ),
  );

  builder.setCurrentBlock(exitBlock);
}
