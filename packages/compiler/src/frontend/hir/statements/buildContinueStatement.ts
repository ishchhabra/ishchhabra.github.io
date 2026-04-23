import type { ContinueStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { createOperationId, JumpTermOp } from "../../../ir";
import { FuncOpBuilder } from "../FuncOpBuilder";

export function buildContinueStatement(
  node: ContinueStatement,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
) {
  const label = node.label?.name;
  const ctx = functionBuilder.getContinueControl(label);
  if (ctx === undefined) {
    throw new Error(
      label ? `Labeled continue target "${label}" not found` : "Continue statement outside of loop",
    );
  }

  const targetBlockId = ctx.continueTarget;
  if (targetBlockId === undefined) {
    throw new Error("Continue control context missing continueTarget");
  }
  const targetBlock = functionBuilder.maybeBlock(targetBlockId);
  if (targetBlock === undefined) {
    throw new Error(`Continue target block ${targetBlockId} not found`);
  }
  functionBuilder.currentBlock.setTerminal(new JumpTermOp(
    createOperationId(environment),
    targetBlock,
    [],
  ));
  return undefined;
}
