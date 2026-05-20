import type { WhileStatement } from "oxc-parser";

import { blockTarget } from "../../ir/core/TerminatorOp";
import { BranchTerminatorOp } from "../../ir/ops/control/BranchTerminatorOp";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { WhileTerminatorOp } from "../../ir/ops/control/WhileTerminatorOp";
import { lowerExpression } from "../expressions/lowerExpression";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { StatementLoweringOptions } from "./loweringOptions";
import { lowerStatement } from "./lowerStatement";

/**
 * Lowers a while loop to explicit control flow with a structured loop owner.
 *
 * The current block jumps to a loop host block. The host owns the structured
 * `WhileTerminatorOp`, the test block evaluates the condition and branches to
 * the body or exit, and a non-terminating body jumps back to the loop host.
 */
export function lowerWhileStatement(
  builder: FunctionIRBuilder,
  statement: WhileStatement,
  options: StatementLoweringOptions = {},
): void {
  const loopBlock = builder.createBlock();
  const testBlock = builder.createBlock();
  const bodyBlock = builder.createBlock();
  const exitBlock = builder.createBlock();

  builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(loopBlock)));

  const control = {
    kind: "loop" as const,
    label: options.label ?? null,
    breakTarget: exitBlock,
    continueTarget: blockTarget(loopBlock),
  };

  builder.setCurrentBlock(loopBlock);
  builder.terminate(
    new WhileTerminatorOp(
      builder.operationId(),
      blockTarget(testBlock),
      blockTarget(bodyBlock),
      blockTarget(exitBlock),
      "while",
      options.label ?? null,
    ),
  );

  builder.setCurrentBlock(testBlock);
  const condition = lowerExpression(builder, statement.test);
  builder.terminate(
    new BranchTerminatorOp(
      builder.operationId(),
      condition,
      blockTarget(bodyBlock),
      blockTarget(exitBlock),
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
    builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(loopBlock)));
  }

  builder.setCurrentBlock(exitBlock);
}
