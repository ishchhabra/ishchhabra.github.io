import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { getFunctionName } from "../../../babel-utils";
import { Environment } from "../../../environment";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import type { PendingRenames } from "./buildBindings";
import { isContextVariable } from "./isContextVariable";

export function buildFunctionDeclarationBindings(
  bindingsPath: NodePath<t.Node>,
  nodePath: NodePath<t.FunctionDeclaration>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  pendingRenames?: PendingRenames,
) {
  // For function declarations, we only want direct children
  // of the binding path. The nested function declarations
  // are not in the scope of the current path.
  const parentPath = nodePath.parentPath;
  if (!parentPath.isExportDeclaration() && parentPath !== bindingsPath) {
    return;
  }

  const functionName = getFunctionName(nodePath);
  if (functionName === null) {
    return;
  }

  const identifier = environment.createIdentifier();
  functionBuilder.registerDeclarationName(
    functionName.node.name,
    identifier.declarationId,
    bindingsPath,
  );

  // Mark context variables before renaming so SSA can skip them.
  const binding = bindingsPath.scope.getBinding(functionName.node.name);
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
}
