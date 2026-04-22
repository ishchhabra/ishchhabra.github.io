import { Environment } from "../../../environment";
import { createOperationId, JumpOp, TryTerm, Value } from "../../../ir";
import type { TryStatement } from "oxc-parser";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";

export function buildTryStatement(
  node: TryStatement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const parentBlock = functionBuilder.currentBlock;
  const hasHandler = node.handler !== null;
  const hasFinalizer = node.finalizer !== null;

  const tryBlock = environment.createBlock();
  const handlerBlock = hasHandler ? environment.createBlock() : null;
  const finallyBlock = hasFinalizer ? environment.createBlock() : null;
  const fallthroughBlock = environment.createBlock();

  functionBuilder.addBlock(tryBlock);
  if (handlerBlock) functionBuilder.addBlock(handlerBlock);
  if (finallyBlock) functionBuilder.addBlock(finallyBlock);
  functionBuilder.addBlock(fallthroughBlock);

  // Build try body
  functionBuilder.currentBlock = tryBlock;
  buildOwnedBody(node.block, scope, functionBuilder, moduleBuilder, environment);
  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.terminal = new JumpOp(
      createOperationId(environment),
      (finallyBlock ?? fallthroughBlock).id,
      [],
    );
  }

  // Build catch handler
  let handlerParam: Value | null = null;
  if (handlerBlock && node.handler !== null) {
    const catchClause = node.handler;
    const catchScope = functionBuilder.scopeFor(catchClause);
    functionBuilder.currentBlock = handlerBlock;

    if (catchClause.param != null && catchClause.param.type === "Identifier") {
      const identifier = environment.createValue();
      functionBuilder.registerDeclarationName(
        catchClause.param.name,
        identifier.declarationId,
        catchScope,
      );
      functionBuilder.instantiateDeclaration(
        identifier.declarationId,
        "catch",
        catchClause.param.name,
        catchScope,
      );
      environment.registerDeclaration(
        identifier.declarationId,
        functionBuilder.currentBlock.id,
        identifier,
      );
      environment.setDeclarationBinding(identifier.declarationId, identifier);
      handlerParam = identifier;
      handlerBlock.entryBindings.push(identifier);
    }

    buildOwnedBody(catchClause.body, scope, functionBuilder, moduleBuilder, environment);
    if (functionBuilder.currentBlock.terminal === undefined) {
      functionBuilder.currentBlock.terminal = new JumpOp(
        createOperationId(environment),
        (finallyBlock ?? fallthroughBlock).id,
        [],
      );
    }
  }

  // Build finally body
  if (finallyBlock && node.finalizer !== null) {
    functionBuilder.currentBlock = finallyBlock;
    buildOwnedBody(node.finalizer, scope, functionBuilder, moduleBuilder, environment);
    if (functionBuilder.currentBlock.terminal === undefined) {
      functionBuilder.currentBlock.terminal = new JumpOp(
        createOperationId(environment),
        fallthroughBlock.id,
        [],
      );
    }
  }

  // Terminate parent with TryTerm routing to try-body
  parentBlock.terminal = new TryTerm(
    createOperationId(environment),
    tryBlock,
    handlerBlock,
    handlerParam,
    finallyBlock,
    fallthroughBlock,
  );

  functionBuilder.currentBlock = fallthroughBlock;
  return undefined;
}
