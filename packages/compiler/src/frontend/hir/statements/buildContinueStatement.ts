import type { ContinueStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { ContinueOp, createOperationId } from "../../../ir";
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

  functionBuilder.currentBlock.terminal = new ContinueOp(createOperationId(environment), label);
  return undefined;
}
