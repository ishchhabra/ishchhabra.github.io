import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import {
  DeclareLocalInstruction,
  createInstructionId,
  JumpTerminal,
  TryTerminal,
} from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildTryStatement(
  node: ESTree.TryStatement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const currentBlock = functionBuilder.currentBlock;

  const hasHandler = node.handler !== null;
  const hasFinalizer = node.finalizer !== null;

  // Create the fallthrough block (continuation after entire try statement).
  const fallthroughBlock = environment.createBlock();
  functionBuilder.blocks.set(fallthroughBlock.id, fallthroughBlock);

  // Create the finally block if present.
  let finallyBlock = null;
  if (hasFinalizer) {
    finallyBlock = environment.createBlock();
    functionBuilder.blocks.set(finallyBlock.id, finallyBlock);
  }

  // The target that try/catch bodies jump to after normal completion.
  const jumpTarget = finallyBlock ?? fallthroughBlock;

  // Build the try body block.
  const tryBlock = environment.createBlock();
  functionBuilder.blocks.set(tryBlock.id, tryBlock);

  functionBuilder.currentBlock = tryBlock;
  buildNode(node.block, scope, functionBuilder, moduleBuilder, environment);

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
    const handlerBlock = environment.createBlock();
    functionBuilder.blocks.set(handlerBlock.id, handlerBlock);

    functionBuilder.currentBlock = handlerBlock;

    // Build the catch parameter binding if present.
    let paramPlace: import("../../../ir").Place | null = null;
    if (catchClause.param != null && catchClause.param.type === "Identifier") {
      const catchScope = functionBuilder.scopeFor(catchClause);
      // Create a binding for the catch parameter.
      const identifier = environment.createIdentifier(undefined, scope.allocateName());
      functionBuilder.registerDeclarationName(
        catchClause.param.name,
        identifier.declarationId,
        catchScope,
      );
      functionBuilder.instantiateDeclaration(
        identifier.declarationId,
        "catch",
        catchClause.param.name,
      );
      // Create DeclareLocal for the catch parameter.
      // No StoreLocal needed — the catch clause syntax provides the binding,
      // similar to how function parameters work.
      const bindingPlace = environment.createPlace(identifier);
      functionBuilder.addInstruction(
        environment.createInstruction(DeclareLocalInstruction, bindingPlace, "const"),
      );

      environment.registerDeclaration(
        identifier.declarationId,
        functionBuilder.currentBlock.id,
        bindingPlace.id,
      );

      paramPlace = bindingPlace;
    }

    // Build the catch body.
    buildNode(catchClause.body, scope, functionBuilder, moduleBuilder, environment);

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
    buildNode(node.finalizer!, scope, functionBuilder, moduleBuilder, environment);

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
