import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { JumpTerminal, makeInstructionId } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { instantiateScopeBindings } from "../bindings";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildStatementList } from "./buildStatementList";

export function buildBlockStatement(
  node: ESTree.BlockStatement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const currentBlock = functionBuilder.currentBlock;

  const block = environment.createBlock();
  functionBuilder.blocks.set(block.id, block);
  functionBuilder.currentBlock = block;

  const blockScope = functionBuilder.scopeFor(node);
  instantiateScopeBindings(node, blockScope, functionBuilder, environment, moduleBuilder);

  buildStatementList(node.body, blockScope, functionBuilder, moduleBuilder, environment);

  currentBlock.terminal = new JumpTerminal(
    makeInstructionId(functionBuilder.environment.nextInstructionId++),
    block.id,
  );
  return undefined;
}
