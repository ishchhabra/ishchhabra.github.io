import type { BlockStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { BlockOp, JumpOp, Region, createOperationId } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";

export function buildBlockStatement(
  node: BlockStatement,
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
  functionBuilder.addBlock(headerBlock);

  const bodyBlock = environment.createBlock(blockScopeId);
  functionBuilder.addBlock(bodyBlock);

  const exitBlock = environment.createBlock(scopeId);
  functionBuilder.addBlock(exitBlock);

  currentBlock.terminal = new JumpOp(createOperationId(environment), headerBlock.id);

  const bodyRegion = new Region([]);
  bodyRegion.moveBlockHere(bodyBlock);

  functionBuilder.currentBlock = bodyBlock;
  functionBuilder.withStructureRegion(bodyRegion, () => {
    buildOwnedBody(node, scope, functionBuilder, moduleBuilder, environment);
  });

  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.terminal = new JumpOp(
      createOperationId(environment),
      exitBlock.id,
    );
  }

  functionBuilder.structures.set(
    headerBlock.id,
    new BlockOp(createOperationId(environment), headerBlock.id, exitBlock.id, bodyRegion),
  );

  functionBuilder.currentBlock = exitBlock;
  return undefined;
}
