import type { Class } from "oxc-parser";
import { Environment } from "../../../environment";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { isBindingOwnedByScope } from "./isBindingOwnedByScope";
import { isContextVariable } from "./isContextVariable";

export function buildClassDeclarationBindings(
  scope: Scope,
  node: Class,
  functionBuilder: FuncOpBuilder,
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

  const identifier = environment.createValue();
  functionBuilder.registerDeclarationName(idNode.name, identifier.declarationId, scope);
  functionBuilder.instantiateDeclaration(identifier.declarationId, "class", idNode.name, scope);

  // Mark context variables so SSA can skip them.
  if (binding && isContextVariable(binding, scope)) {
    environment.contextDeclarationIds.add(identifier.declarationId);
  }

  const place = identifier;
  environment.registerDeclaration(identifier.declarationId, functionBuilder.currentBlock.id, place);
  environment.setDeclarationBinding(identifier.declarationId, place);
}
