import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import {
  BindingIdentifierInstruction,
  createInstructionId,
  JumpTerminal,
  TryTerminal,
} from "../../../ir";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildTryStatement(
  nodePath: NodePath<t.TryStatement>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const currentBlock = functionBuilder.currentBlock;

  const hasHandler = nodePath.node.handler !== null;
  const hasFinalizer = nodePath.node.finalizer !== null;

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
  const tryBodyPath = nodePath.get("block");
  buildNode(tryBodyPath, functionBuilder, moduleBuilder, environment);

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
    const handlerPath = nodePath.get("handler") as NodePath<t.CatchClause>;
    const handlerBlock = environment.createBlock();
    functionBuilder.blocks.set(handlerBlock.id, handlerBlock);

    functionBuilder.currentBlock = handlerBlock;

    // Build the catch parameter binding if present.
    const paramPath = handlerPath.get("param");
    let paramPlace: import("../../../ir").Place | null = null;
    if (paramPath.hasNode() && paramPath.isIdentifier()) {
      // Create a binding for the catch parameter.
      const identifier = environment.createIdentifier();
      functionBuilder.registerDeclarationName(
        paramPath.node.name,
        identifier.declarationId,
        handlerPath,
      );
      handlerPath.scope.rename(paramPath.node.name, identifier.name);
      functionBuilder.registerDeclarationName(
        identifier.name,
        identifier.declarationId,
        handlerPath,
      );

      // Create BindingIdentifier for the catch parameter.
      // No StoreLocal needed — the catch clause syntax provides the binding,
      // similar to how function parameters work.
      const bindingPlace = environment.createPlace(identifier);
      functionBuilder.addInstruction(
        environment.createInstruction(BindingIdentifierInstruction, bindingPlace, handlerPath),
      );

      environment.registerDeclaration(
        identifier.declarationId,
        functionBuilder.currentBlock.id,
        bindingPlace.id,
      );

      paramPlace = bindingPlace;
    }

    // Build the catch body.
    const handlerBodyPath = handlerPath.get("body");
    buildNode(handlerBodyPath, functionBuilder, moduleBuilder, environment);

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
    const finalizerPath = nodePath.get("finalizer") as NodePath<t.BlockStatement>;
    buildNode(finalizerPath, functionBuilder, moduleBuilder, environment);

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
