import type * as AST from "../../estree";
import { Environment } from "../../../environment";
import { DeclareLocalInstruction } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { isBindingOwnedByScope } from "./isBindingOwnedByScope";
import { isContextVariable } from "./isContextVariable";

export function buildClassDeclarationBindings(
  scope: Scope,
  node: AST.ClassDeclaration,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const idNode = node.id;
  if (idNode == null || idNode.type !== "Identifier") {
    return;
  }

  // Class declarations create their own inner scope for the class name,
  // but the binding is owned by the enclosing (parent) scope.
  const binding = scope.getBinding(idNode.name);
  if (!isBindingOwnedByScope(scope, binding)) {
    return;
  }

  const identifier = environment.createIdentifier();
  functionBuilder.registerDeclarationName(idNode.name, identifier.declarationId, scope);
  functionBuilder.instantiateDeclaration(identifier.declarationId, "class", idNode.name);

  // Mark context variables so SSA can skip them.
  if (binding && isContextVariable(binding, scope)) {
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
