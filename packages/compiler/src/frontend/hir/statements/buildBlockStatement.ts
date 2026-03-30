import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { JumpTerminal, makeInstructionId } from "../../../ir";
import { instantiateScopeBindings } from "../bindings";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildStatementList } from "./buildStatementList";

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
  buildStatementList(body, functionBuilder, moduleBuilder, environment);

  currentBlock.terminal = new JumpTerminal(
    makeInstructionId(functionBuilder.environment.nextInstructionId++),
    block.id,
  );
  return undefined;
}
