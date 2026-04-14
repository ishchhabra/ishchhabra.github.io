import type { BreakStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { BreakOp, createOperationId } from "../../../ir";
import { FuncOpBuilder } from "../FuncOpBuilder";

export function buildBreakStatement(
  node: BreakStatement,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
) {
  const label = node.label?.name;
  const ctx = functionBuilder.getBreakControl(label);
  if (ctx === undefined) {
    throw new Error(
      label
        ? `Labeled break target "${label}" not found`
        : "Break statement outside of switch/loop",
    );
  }

  functionBuilder.currentBlock.terminal = new BreakOp(createOperationId(environment), label);
  return undefined;
}
