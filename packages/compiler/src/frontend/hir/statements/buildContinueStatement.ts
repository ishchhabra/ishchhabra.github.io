import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { createInstructionId, JumpTerminal } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildContinueStatement(
  node: ESTree.ContinueStatement,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const label = node.label?.name;
  const target = functionBuilder.getContinueTarget(label);
  if (target === undefined) {
    throw new Error(
      label ? `Labeled continue target "${label}" not found` : "Continue statement outside of loop",
    );
  }

  functionBuilder.currentBlock.terminal = new JumpTerminal(
    createInstructionId(environment),
    target,
  );

  return undefined;
}
