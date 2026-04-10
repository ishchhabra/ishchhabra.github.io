import { Environment } from "../../../environment";
import {
  createInstructionId,
  DeclareLocalInstruction,
  JumpTerminal,
  TryTerminal,
} from "../../../ir";
import type { TryStatement } from "oxc-parser";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";

export function buildTryStatement(
  node: TryStatement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const currentBlock = functionBuilder.currentBlock;
  const scopeId = functionBuilder.lexicalScopeIdFor(scope);

  const hasHandler = node.handler !== null;
  const hasFinalizer = node.finalizer !== null;

  // Create the fallthrough block (continuation after entire try statement).
  const fallthroughBlock = environment.createBlock(scopeId);
  functionBuilder.blocks.set(fallthroughBlock.id, fallthroughBlock);

  // Create the finally block if present.
  let finallyBlock = null;
  if (hasFinalizer) {
    const finalizerScope = functionBuilder.scopeFor(node.finalizer!);
    const finalizerScopeId = functionBuilder.lexicalScopeIdFor(finalizerScope);
    finallyBlock = environment.createBlock(finalizerScopeId);
    functionBuilder.blocks.set(finallyBlock.id, finallyBlock);
  }

  // The target that try/catch bodies jump to after normal completion.
  const jumpTarget = finallyBlock ?? fallthroughBlock;

  // Build the try body block.
  const tryBodyScope = functionBuilder.scopeFor(node.block);
  const tryBodyScopeId = functionBuilder.lexicalScopeIdFor(tryBodyScope);
  const tryBlock = environment.createBlock(tryBodyScopeId);
  functionBuilder.blocks.set(tryBlock.id, tryBlock);

  functionBuilder.currentBlock = tryBlock;
  buildOwnedBody(node.block, scope, functionBuilder, moduleBuilder, environment);

  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.terminal = new JumpTerminal(
      createInstructionId(environment),
      jumpTarget.id,
    );
  }

  // Build the catch handler block if present.
  let handler: {
    param: import("../../../ir").Place | null;
    block: import("../../../ir").BlockId;
  } | null = null;
  if (hasHandler) {
    const catchClause = node.handler!;
    const catchScope = functionBuilder.scopeFor(catchClause);
    const catchScopeId = functionBuilder.lexicalScopeIdFor(catchScope, "catch");
    const handlerBlock = environment.createBlock(catchScopeId);
    functionBuilder.blocks.set(handlerBlock.id, handlerBlock);

    functionBuilder.currentBlock = handlerBlock;

    // Build the catch parameter binding if present.
    let paramPlace: import("../../../ir").Place | null = null;
    if (catchClause.param != null && catchClause.param.type === "Identifier") {
      // Create a binding for the catch parameter.
      const identifier = environment.createIdentifier();
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
      const bindingPlace = environment.createPlace(identifier);

      environment.registerDeclaration(
        identifier.declarationId,
        functionBuilder.currentBlock.id,
        bindingPlace.id,
      );
      environment.setDeclarationBindingPlace(identifier.declarationId, bindingPlace.id);

      paramPlace = bindingPlace;
    }

    // Build the catch body.
    buildOwnedBody(catchClause.body, scope, functionBuilder, moduleBuilder, environment);

    if (functionBuilder.currentBlock.terminal === undefined) {
      functionBuilder.currentBlock.terminal = new JumpTerminal(
        createInstructionId(environment),
        jumpTarget.id,
      );
    }

    handler = { param: paramPlace, block: handlerBlock.id };
  }

  // Build the finally block body if present.
  if (finallyBlock !== null && hasFinalizer) {
    functionBuilder.currentBlock = finallyBlock;
    buildOwnedBody(node.finalizer!, scope, functionBuilder, moduleBuilder, environment);

    if (functionBuilder.currentBlock.terminal === undefined) {
      functionBuilder.currentBlock.terminal = new JumpTerminal(
        createInstructionId(environment),
        fallthroughBlock.id,
      );
    }
  }

  // Set the TryTerminal on the current (pre-try) block.
  currentBlock.terminal = new TryTerminal(
    createInstructionId(environment),
    tryBlock.id,
    handler,
    finallyBlock?.id ?? null,
    fallthroughBlock.id,
  );

  functionBuilder.currentBlock = fallthroughBlock;
  return undefined;
}
