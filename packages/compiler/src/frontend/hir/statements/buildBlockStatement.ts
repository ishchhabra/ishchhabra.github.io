import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { JumpTerminal, makeInstructionId } from "../../../ir";
import { instantiateScopeBindings } from "../bindings";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildBlockStatement(
  nodePath: NodePath<t.BlockStatement>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const currentBlock = functionBuilder.currentBlock;

  const block = environment.createBlock();
  functionBuilder.blocks.set(block.id, block);
  functionBuilder.currentBlock = block;

  instantiateScopeBindings(nodePath, functionBuilder, environment);

  const body = nodePath.get("body");
  for (const statementPath of body) {
    buildNode(statementPath, functionBuilder, moduleBuilder, environment);
    // Do not emit unreachable statements after break/return/throw/etc.
    if (functionBuilder.currentBlock.terminal !== undefined) {
      break;
    }
  }

  currentBlock.terminal = new JumpTerminal(
    makeInstructionId(functionBuilder.environment.nextInstructionId++),
    block.id,
  );
  return undefined;
}
