import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { getFunctionName } from "../../../babel-utils";
import { Environment } from "../../../environment";
import { DeclareLocalInstruction, FunctionDeclarationInstruction } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { getDeclarationOwningPath } from "../getDeclarationOwningPath";
import type { PendingRenames } from "./instantiateScopeBindings";
import { isBindingOwnedByScope } from "./isBindingOwnedByScope";
import { isContextVariable } from "./isContextVariable";

export function buildFunctionDeclarationBindings(
  bindingsPath: NodePath<t.Node>,
  nodePath: NodePath<t.FunctionDeclaration>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  moduleBuilder: ModuleIRBuilder,
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
    environment.createInstruction(DeclareLocalInstruction, place, functionName, "const"),
  );

  // Per the ECMA spec, function declarations are fully initialized during
  // declaration instantiation — not at their lexical position. Build the
  // function body and emit the FunctionDeclarationInstruction now so that
  // the binding is available before the scope body executes.
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

  const fnPlace = environment.createPlace(environment.createIdentifier(identifier.declarationId));
  const instruction = environment.createInstruction(
    FunctionDeclarationInstruction,
    fnPlace,
    nodePath,
    place,
    functionIR,
    nodePath.node.generator,
    nodePath.node.async,
    capturedPlaces,
  );
  functionBuilder.addInstruction(instruction);
  environment.registerDeclarationInstruction(fnPlace, instruction);
}
