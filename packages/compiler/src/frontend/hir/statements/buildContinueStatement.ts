import type { ContinueStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { ContinueOp, JumpOp, createOperationId } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildContinueStatement(
  node: ContinueStatement,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const label = node.label?.name;
  const ctx = functionBuilder.getContinueControl(label);
  if (ctx === undefined) {
    throw new Error(
      label ? `Labeled continue target "${label}" not found` : "Continue statement outside of loop",
    );
  }

  // Structured loops get a ContinueOp; flat loops keep a raw JumpOp
  // back-edge so the existing back-edge detection in codegen continues
  // to work.
  functionBuilder.currentBlock.terminal = ctx.structured
    ? new ContinueOp(createOperationId(environment), label)
    : new JumpOp(createOperationId(environment), ctx.continueTarget);

  return undefined;
}
