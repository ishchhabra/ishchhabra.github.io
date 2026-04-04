import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { DeclareLocalInstruction } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { getDeclarationOwningPath } from "../getDeclarationOwningPath";
import { isBindingOwnedByScope } from "./isBindingOwnedByScope";
import { isContextVariable } from "./isContextVariable";

export function buildClassDeclarationBindings(
  bindingsPath: NodePath<t.Node>,
  nodePath: NodePath<t.ClassDeclaration>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const idPath = nodePath.get("id");
  if (!idPath.isIdentifier()) {
    return;
  }
  const idNode = idPath.node;

  const owningPath = getDeclarationOwningPath(nodePath);
  const binding = owningPath.scope.getBinding(idNode.name);
  if (!isBindingOwnedByScope(bindingsPath, binding)) {
    return;
  }

  const identifier = environment.createIdentifier();
  functionBuilder.registerDeclarationName(idNode.name, identifier.declarationId, bindingsPath);
  functionBuilder.instantiateDeclaration(identifier.declarationId, "class", idNode.name);

  // Mark context variables so SSA can skip them.
  if (binding && isContextVariable(binding, bindingsPath)) {
    environment.contextDeclarationIds.add(identifier.declarationId);
  }

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
