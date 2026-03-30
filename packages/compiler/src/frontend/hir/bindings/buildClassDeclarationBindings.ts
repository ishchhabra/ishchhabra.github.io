import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import type { PendingRenames } from "./instantiateScopeBindings";
import { isBindingOwnedByScope } from "./isBindingOwnedByScope";
import { isContextVariable } from "./isContextVariable";

export function buildClassDeclarationBindings(
  bindingsPath: NodePath<t.Node>,
  nodePath: NodePath<t.ClassDeclaration>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  pendingRenames?: PendingRenames,
) {
  const idNode = nodePath.node.id;
  if (idNode == null) {
    return;
  }

  const binding = nodePath.scope.getBinding(idNode.name);
  if (!isBindingOwnedByScope(bindingsPath, binding)) {
    return;
  }

  const identifier = environment.createIdentifier();
  functionBuilder.registerDeclarationName(idNode.name, identifier.declarationId, bindingsPath);
  functionBuilder.instantiateDeclaration(identifier.declarationId, "class", idNode.name);

  // Mark context variables before renaming so SSA can skip them.
  if (binding && isContextVariable(binding, bindingsPath)) {
    environment.contextDeclarationIds.add(identifier.declarationId);
  }

  if (pendingRenames) {
    pendingRenames.push([idNode.name, identifier.name]);
  } else {
    bindingsPath.scope.rename(idNode.name, identifier.name);
  }
  functionBuilder.registerDeclarationName(identifier.name, identifier.declarationId, bindingsPath);

  const place = environment.createPlace(identifier);
  environment.registerDeclaration(
    identifier.declarationId,
    functionBuilder.currentBlock.id,
    place.id,
  );
}
