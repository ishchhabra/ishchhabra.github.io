import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { LabeledStatement, Statement } from "oxc-parser";
import { lowerStatement } from "./lowerStatement";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { blockTarget } from "../../ir/core/TerminatorOp";
import { LabeledTerminatorOp } from "../../ir/ops/control/LabeledTerminatorOp";

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
  const exitBlock = builder.createBlock();
  const context = {
    kind: "label" as const,
    label,
    breakTarget: exitBlock,
  };

  builder.terminate(
    new LabeledTerminatorOp(builder.operationId(), label, blockTarget(bodyBlock), exitBlock),
  );

  builder.pushControl(context);

  try {
    builder.setCurrentBlock(bodyBlock);
    lowerStatement(builder, statement.body);
  } finally {
    builder.popControl(context);
  }

  if (!builder.currentBlock.isTerminated) {
    builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(exitBlock)));
  }

  builder.setCurrentBlock(exitBlock);
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
