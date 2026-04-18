import type * as AST from "../../estree";
import type { Node } from "oxc-parser";
import { Environment } from "../../../environment";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { isContextVariable } from "./isContextVariable";

export function instantiateFunctionParamBindings(
  params: AST.Pattern[],
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
) {
  for (const param of params) {
    instantiateParamBinding(param, scope, functionBuilder, environment);
  }
}

function instantiateParamBinding(
  node: AST.Pattern,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
) {
  if (node.type === "Identifier") {
    instantiateIdentifierParamBinding(node, scope, functionBuilder, environment);
    return;
  }

  if (node.type === "ArrayPattern") {
    for (const element of node.elements) {
      if (element == null) {
        continue;
      }

      instantiateParamBinding(element, scope, functionBuilder, environment);
    }
    return;
  }

  if (node.type === "ObjectPattern") {
    for (const property of node.properties) {
      if (property.type === "Property") {
        instantiateParamBinding(property.value as AST.Pattern, scope, functionBuilder, environment);
        continue;
      }

      if (property.type === "RestElement") {
        instantiateParamBinding(property.argument, scope, functionBuilder, environment);
        continue;
      }

      throw new Error(`Unsupported object pattern property: ${(property as Node).type}`);
    }
    return;
  }

  if (node.type === "AssignmentPattern") {
    instantiateParamBinding(node.left, scope, functionBuilder, environment);
    return;
  }

  if (node.type === "RestElement") {
    instantiateParamBinding(node.argument, scope, functionBuilder, environment);
    return;
  }

  throw new Error(`Unsupported param type: ${(node as Node).type}`);
}

function instantiateIdentifierParamBinding(
  node: AST.Value,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
) {
  const originalName = node.name;
  if (scope.data.get(originalName) !== undefined) {
    return;
  }

  const binding = scope.getBinding(originalName);
  const place = environment.createValue();

  functionBuilder.registerDeclarationName(originalName, place.declarationId, scope);
  functionBuilder.instantiateDeclaration(place.declarationId, "param", originalName, scope);

  if (binding && isContextVariable(binding, scope)) {
    environment.contextDeclarationIds.add(place.declarationId);
  }

  environment.registerDeclaration(place.declarationId, functionBuilder.currentBlock.id, place);
  environment.setDeclarationBinding(place.declarationId, place);
}
