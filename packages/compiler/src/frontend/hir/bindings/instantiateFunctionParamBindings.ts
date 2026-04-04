import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { DeclareLocalInstruction } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { isContextVariable } from "./isContextVariable";

export function instantiateFunctionParamBindings(
  paramPaths: NodePath<t.Identifier | t.RestElement | t.Pattern>[],
  scopePath: NodePath<t.Node>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  for (const paramPath of paramPaths) {
    instantiateParamBinding(paramPath as NodePath<t.LVal>, scopePath, functionBuilder, environment);
  }
}

function instantiateParamBinding(
  nodePath: NodePath<t.LVal>,
  scopePath: NodePath,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  if (nodePath.isIdentifier()) {
    instantiateIdentifierParamBinding(nodePath, scopePath, functionBuilder, environment);
    return;
  }

  if (nodePath.isArrayPattern()) {
    for (const elementPath of nodePath.get("elements")) {
      if (!elementPath.hasNode()) {
        continue;
      }

      instantiateParamBinding(
        elementPath as NodePath<t.LVal>,
        scopePath,
        functionBuilder,
        environment,
      );
    }
    return;
  }

  if (nodePath.isObjectPattern()) {
    for (const propertyPath of nodePath.get("properties")) {
      if (propertyPath.isObjectProperty()) {
        const valuePath = propertyPath.get("value");
        instantiateParamBinding(
          valuePath as NodePath<t.LVal>,
          scopePath,
          functionBuilder,
          environment,
        );
        continue;
      }

      if (propertyPath.isRestElement()) {
        const argumentPath = propertyPath.get("argument");
        instantiateParamBinding(
          argumentPath as NodePath<t.LVal>,
          scopePath,
          functionBuilder,
          environment,
        );
        continue;
      }

      throw new Error(`Unsupported object pattern property: ${propertyPath.type}`);
    }
    return;
  }

  if (nodePath.isAssignmentPattern()) {
    const leftPath = nodePath.get("left");
    instantiateParamBinding(leftPath, scopePath, functionBuilder, environment);
    return;
  }

  if (nodePath.isRestElement()) {
    const argumentPath = nodePath.get("argument");
    instantiateParamBinding(
      argumentPath as NodePath<t.LVal>,
      scopePath,
      functionBuilder,
      environment,
    );
    return;
  }

  throw new Error(`Unsupported param type: ${nodePath.type}`);
}

function instantiateIdentifierParamBinding(
  nodePath: NodePath<t.Identifier>,
  scopePath: NodePath,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const originalName = nodePath.node.name;
  if (scopePath.scope.data[originalName] !== undefined) {
    return;
  }

  const binding = scopePath.scope.getBinding(originalName);
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);

  functionBuilder.registerDeclarationName(originalName, identifier.declarationId, scopePath);
  functionBuilder.instantiateDeclaration(identifier.declarationId, "param", originalName);

  if (binding && isContextVariable(binding, scopePath)) {
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
