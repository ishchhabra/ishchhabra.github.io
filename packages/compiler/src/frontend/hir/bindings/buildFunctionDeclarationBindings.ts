import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { getFunctionName } from "../../../babel-utils";
import { Environment } from "../../../environment";
import { DeclareLocalInstruction, StoreLocalInstruction } from "../../../ir";
import { FunctionExpressionInstruction } from "../../../ir/instructions/value/FunctionExpression";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { getDeclarationOwningPath } from "../getDeclarationOwningPath";
import type { PendingRenames } from "./instantiateScopeBindings";
import { isBindingOwnedByScope } from "./isBindingOwnedByScope";
import { isContextVariable } from "./isContextVariable";

/**
 * Phase 1: Register the function declaration binding in the scope.
 * Creates the binding identity and emits a DeclareLocal instruction,
 * but does NOT build the function body yet.
 */
export function registerFunctionDeclarationBinding(
  bindingsPath: NodePath<t.Node>,
  nodePath: NodePath<t.FunctionDeclaration>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  pendingRenames?: PendingRenames,
) {
  const functionName = getFunctionName(nodePath);
  if (functionName === null) {
    return;
  }

  const owningPath = getDeclarationOwningPath(nodePath);
  const binding = owningPath.scope.getBinding(functionName.node.name);
  if (!isBindingOwnedByScope(bindingsPath, binding)) {
    return;
  }

  const identifier = environment.createIdentifier();
  functionBuilder.registerDeclarationName(
    functionName.node.name,
    identifier.declarationId,
    bindingsPath,
  );
  functionBuilder.instantiateDeclaration(
    identifier.declarationId,
    "function",
    functionName.node.name,
  );

  // Mark context variables before renaming so SSA can skip them.
  if (binding && isContextVariable(binding, bindingsPath)) {
    environment.contextDeclarationIds.add(identifier.declarationId);
  }

  if (pendingRenames) {
    pendingRenames.push([functionName.node.name, identifier.name]);
  } else {
    bindingsPath.scope.rename(functionName.node.name, identifier.name);
  }
  functionBuilder.registerDeclarationName(identifier.name, identifier.declarationId, bindingsPath);

  const place = environment.createPlace(identifier);
  environment.registerDeclaration(
    identifier.declarationId,
    functionBuilder.currentBlock.id,
    place.id,
  );
  functionBuilder.addInstruction(
    environment.createInstruction(DeclareLocalInstruction, place, "const"),
  );
}

/**
 * Phase 2: Build the function body and emit a FunctionExpressionInstruction + StoreLocal.
 * Per ECMA-262 §10.2.11, InstantiateFunctionObject runs after ALL bindings in
 * the scope have been created, so this must be called after all register*
 * functions have completed.
 */
export function initializeFunctionDeclaration(
  bindingsPath: NodePath<t.Node>,
  nodePath: NodePath<t.FunctionDeclaration>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  moduleBuilder: ModuleIRBuilder,
) {
  const functionName = getFunctionName(nodePath);
  if (functionName === null) {
    return;
  }

  const owningPath = getDeclarationOwningPath(nodePath);
  const binding = owningPath.scope.getBinding(functionName.node.name);
  if (!isBindingOwnedByScope(bindingsPath, binding)) {
    return;
  }

  const idName = nodePath.get("id");
  if (!idName.isIdentifier()) {
    return;
  }

  const declarationId = functionBuilder.getDeclarationId(idName.node.name, owningPath);
  if (declarationId === undefined) {
    throw new Error(`Function declaration binding was not registered: ${idName.node.name}`);
  }

  const latestDeclaration = environment.getLatestDeclaration(declarationId);
  const identifierPlace = environment.places.get(latestDeclaration.placeId);
  if (identifierPlace === undefined) {
    throw new Error(`Unable to find the place for ${idName.node.name} (${declarationId})`);
  }

  const paramPaths = nodePath.get("params");
  const bodyPath = nodePath.get("body");
  const functionIRBuilder = new FunctionIRBuilder(
    paramPaths,
    bodyPath,
    bodyPath,
    functionBuilder.environment,
    moduleBuilder,
    nodePath.node.async,
    nodePath.node.generator,
  );
  const functionIR = functionIRBuilder.build();

  functionBuilder.propagateCapturesFrom(functionIRBuilder);
  const capturedPlaces = [...functionIRBuilder.captures.values()];

  const fnPlace = environment.createPlace(environment.createIdentifier(declarationId));
  const instruction = environment.createInstruction(
    FunctionExpressionInstruction,
    fnPlace,
    identifierPlace,
    functionIR,
    nodePath.node.generator,
    nodePath.node.async,
    capturedPlaces,
  );
  functionBuilder.addInstruction(instruction);
  environment.registerDeclarationInstruction(fnPlace, instruction);

  const isContext = environment.contextDeclarationIds.has(declarationId);
  const storePlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    environment.createInstruction(
      StoreLocalInstruction,
      storePlace,
      identifierPlace,
      fnPlace,
      isContext ? ("let" as const) : ("const" as const),
      [],
    ),
  );
}
