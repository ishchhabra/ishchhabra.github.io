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
  if (nodePath.node.label !== null) {
    throw new Error("Labeled continue statements are not supported");
  }

  const target = functionBuilder.getContinueTarget();
  if (target === undefined) {
    throw new Error("Continue statement outside of loop");
  }

  functionBuilder.currentBlock.terminal = new JumpTerminal(
    createInstructionId(environment),
    target,
  );

  return undefined;
}
