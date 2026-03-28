import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { createInstructionId, JumpTerminal } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildBreakStatement(
  nodePath: NodePath<t.BreakStatement>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const label = nodePath.node.label?.name;
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
