import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ForStatement } from "oxc-parser";
import { lowerVariableDeclaration } from "./lowerVariableDeclaration";
import { lowerExpression } from "../expressions/lowerExpression";
import { ForTerminatorOp } from "../../ir/ops/control/ForTerminatorOp";
import { ConstantOp } from "../../ir/ops/constants/ConstantOp";
import { blockTarget } from "../../ir/core/TerminatorOp";
import { BranchTerminatorOp } from "../../ir/ops/control/BranchTerminatorOp";
import { lowerStatement } from "./lowerStatement";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { Value } from "../../ir/core/Value";
import { lowerExpressionStatement } from "./lowerExpressionStatement";
import { StatementLoweringOptions } from "./loweringOptions";

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
  const exitBlock = builder.createBlock();

  const control = {
    kind: "loop" as const,
    label: options.label ?? null,
    breakTarget: exitBlock,
    continueTarget: updateBlock,
  };

  builder.terminate(
    new JumpTerminatorOp(builder.operationId(), blockTarget(loopBlock)),
  );

  builder.setCurrentBlock(loopBlock);
  builder.terminate(
    new ForTerminatorOp(
      builder.operationId(),
      blockTarget(testBlock),
      bodyBlock,
      updateBlock,
      exitBlock,
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
    builder.terminate(
      new JumpTerminatorOp(builder.operationId(), blockTarget(updateBlock)),
    );
  }

  builder.setCurrentBlock(updateBlock);
  if (statement.update !== null) {
    lowerExpressionStatement(builder, statement.update);
  }
  if (!builder.currentBlock.isTerminated) {
    builder.terminate(
      new JumpTerminatorOp(builder.operationId(), blockTarget(loopBlock)),
    );
  }

  builder.setCurrentBlock(exitBlock);
}

function emitBooleanConstant(
  builder: FunctionIRBuilder,
  value: boolean,
): Value {
  const result = builder.createValue();
  builder.emit(new ConstantOp(builder.operationId(), value, result));
  return result;
}
