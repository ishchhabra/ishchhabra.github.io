import type { IfStatement } from "oxc-parser";

import { blockTarget } from "../../ir/core/TerminatorOp";
import { IfTerminatorOp } from "../../ir/ops/control/IfTerminatorOp";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { lowerExpression } from "../expressions/lowerExpression";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerStatement } from "./lowerStatement";

/**
 * Lowers conditional statement control flow.
 *
 * The test expression executes in the current block. Control then branches to
 * the consequent or alternate body, and any non-terminating body flows into a
 * shared continuation flow.
 */
export function lowerIfStatement(builder: FunctionIRBuilder, statement: IfStatement): void {
  const test = lowerExpression(builder, statement.test);

  const consequentBlock = builder.createBlock();
  const alternateBlock = statement.alternate === null ? null : builder.createBlock();
  const continuationBlock = builder.createBlock();

  builder.terminate(
    new IfTerminatorOp(
      builder.operationId(),
      test,
      blockTarget(consequentBlock),
      blockTarget(alternateBlock ?? continuationBlock),
      continuationBlock,
    ),
  );

  builder.setCurrentBlock(consequentBlock);
  lowerStatement(builder, statement.consequent);
  if (!builder.currentBlock.isTerminated) {
    builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(continuationBlock)));
  }

  if (statement.alternate !== null && alternateBlock !== null) {
    builder.setCurrentBlock(alternateBlock);
    lowerStatement(builder, statement.alternate);
    if (!builder.currentBlock.isTerminated) {
      builder.terminate(
        new JumpTerminatorOp(builder.operationId(), blockTarget(continuationBlock)),
      );
    }
  }

  builder.setCurrentBlock(continuationBlock);
}
