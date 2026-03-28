import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { createInstructionId, JumpTerminal } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildContinueStatement(
  nodePath: NodePath<t.ContinueStatement>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const label = nodePath.node.label?.name;
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
