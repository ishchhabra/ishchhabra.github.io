import type * as AST from "../../estree";
import { Environment } from "../../../environment";
import { BlockStructure, JumpTerminal, createInstructionId } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";

export function buildBlockStatement(
  node: AST.BlockStatement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const currentBlock = functionBuilder.currentBlock;

  const blockScope = functionBuilder.scopeFor(node);
  const scopeId = functionBuilder.lexicalScopeIdFor(scope);
  const blockScopeId = functionBuilder.lexicalScopeIdFor(blockScope);

  const headerBlock = environment.createBlock(scopeId);
  functionBuilder.blocks.set(headerBlock.id, headerBlock);

  const bodyBlock = environment.createBlock(blockScopeId);
  functionBuilder.blocks.set(bodyBlock.id, bodyBlock);

  const exitBlock = environment.createBlock(scopeId);
  functionBuilder.blocks.set(exitBlock.id, exitBlock);

  currentBlock.terminal = new JumpTerminal(createInstructionId(environment), headerBlock.id);

  functionBuilder.currentBlock = bodyBlock;
  buildOwnedBody(node, scope, functionBuilder, moduleBuilder, environment);

  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.terminal = new JumpTerminal(
      createInstructionId(environment),
      exitBlock.id,
    );
  }

  functionBuilder.structures.set(
    headerBlock.id,
    new BlockStructure(headerBlock.id, bodyBlock.id, exitBlock.id),
  );

  functionBuilder.currentBlock = exitBlock;
  return undefined;
}
