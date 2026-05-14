import { LabeledStatement, Statement } from "oxc-parser";

import { blockTarget } from "../../ir/core/TerminatorOp";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { LabeledTerminatorOp } from "../../ir/ops/control/LabeledTerminatorOp";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerStatement } from "./lowerStatement";

/**
 * Lowers labels for `break label` and forwards loop labels to loop lowering.
 */
export function lowerLabeledStatement(
  builder: FunctionIRBuilder,
  statement: LabeledStatement,
): void {
  const label = statement.label.name;

  if (isLoopStatement(statement.body)) {
    return lowerStatement(builder, statement.body, { label });
  }

  const bodyBlock = builder.createBlock();
  const completionBlock = builder.createBlock();
  const context = {
    kind: "label" as const,
    label,
    breakTarget: completionBlock,
  };

  builder.terminate(
    new LabeledTerminatorOp(builder.operationId(), label, blockTarget(bodyBlock), completionBlock),
  );

  builder.pushControl(context);

  try {
    builder.setCurrentBlock(bodyBlock);
    lowerStatement(builder, statement.body);
  } finally {
    builder.popControl(context);
  }

  if (!builder.currentBlock.isTerminated) {
    builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(completionBlock)));
  }

  builder.setCurrentBlock(completionBlock);
}

function isLoopStatement(statement: Statement): boolean {
  return (
    statement.type === "WhileStatement" ||
    statement.type === "DoWhileStatement" ||
    statement.type === "ForStatement" ||
    statement.type === "ForInStatement" ||
    statement.type === "ForOfStatement"
  );
}
