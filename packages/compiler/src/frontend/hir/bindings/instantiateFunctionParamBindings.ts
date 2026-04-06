import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { DeclareLocalInstruction } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { isContextVariable } from "./isContextVariable";

export function instantiateFunctionParamBindings(
  params: ESTree.Pattern[],
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  for (const param of params) {
    instantiateParamBinding(param, scope, functionBuilder, environment);
  }
}

function instantiateParamBinding(
  node: ESTree.Pattern,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
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
        instantiateParamBinding(
          property.value as ESTree.Pattern,
          scope,
          functionBuilder,
          environment,
        );
        continue;
      }

      if (property.type === "RestElement") {
        instantiateParamBinding(property.argument, scope, functionBuilder, environment);
        continue;
      }

      throw new Error(`Unsupported object pattern property: ${(property as ESTree.Node).type}`);
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

  throw new Error(`Unsupported param type: ${(node as ESTree.Node).type}`);
}

function instantiateIdentifierParamBinding(
  node: ESTree.Identifier,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const originalName = node.name;
  if (scope.data.get(originalName) !== undefined) {
    return;
  }

  const binding = scope.getBinding(originalName);
  const identifier = environment.createIdentifier(undefined, scope.allocateName());
  const place = environment.createPlace(identifier);

  functionBuilder.registerDeclarationName(originalName, identifier.declarationId, scope);
  functionBuilder.instantiateDeclaration(identifier.declarationId, "param", originalName);

  if (binding && isContextVariable(binding, scope)) {
    environment.contextDeclarationIds.add(identifier.declarationId);
  }

  environment.registerDeclaration(
    identifier.declarationId,
    functionBuilder.currentBlock.id,
    place.id,
  );
  functionBuilder.header.push(
    environment.createInstruction(DeclareLocalInstruction, place, "const"),
  );
}
