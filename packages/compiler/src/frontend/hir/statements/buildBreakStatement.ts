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
  if (nodePath.node.label !== null) {
    throw new Error("Labeled break statements are not supported");
  }

  const target = functionBuilder.getBreakTarget();
  if (target === undefined) {
    throw new Error("Break statement outside of switch/loop");
  }

  functionBuilder.currentBlock.terminal = new JumpTerminal(
    createInstructionId(environment),
    target,
  );

  return undefined;
}
