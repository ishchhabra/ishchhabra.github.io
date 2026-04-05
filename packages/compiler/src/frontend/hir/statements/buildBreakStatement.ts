import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { createInstructionId, JumpTerminal } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildBreakStatement(
  node: ESTree.BreakStatement,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const label = node.label?.name;
  const target = functionBuilder.getBreakTarget(label);
  if (target === undefined) {
    throw new Error(
      label
        ? `Labeled break target "${label}" not found`
        : "Break statement outside of switch/loop",
    );
  }

  functionBuilder.currentBlock.terminal = new JumpTerminal(
    createInstructionId(environment),
    target,
  );

  return undefined;
}
