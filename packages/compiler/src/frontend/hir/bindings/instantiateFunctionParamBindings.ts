import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { BindingIdentifierInstruction } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { isContextVariable } from "./isContextVariable";

export function instantiateFunctionParamBindings(
  paramPaths: NodePath<t.Identifier | t.RestElement | t.Pattern>[],
  bodyPath: NodePath,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  for (const paramPath of paramPaths) {
    instantiateParamBinding(paramPath as NodePath<t.LVal>, bodyPath, functionBuilder, environment);
  }
}

function instantiateParamBinding(
  nodePath: NodePath<t.LVal>,
  bodyPath: NodePath,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  if (nodePath.isIdentifier()) {
    instantiateIdentifierParamBinding(nodePath, bodyPath, functionBuilder, environment);
    return;
  }

  if (nodePath.isArrayPattern()) {
    for (const elementPath of nodePath.get("elements")) {
      if (!elementPath.hasNode()) {
        continue;
      }

      instantiateParamBinding(
        elementPath as NodePath<t.LVal>,
        bodyPath,
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
          bodyPath,
          functionBuilder,
          environment,
        );
        continue;
      }

      if (propertyPath.isRestElement()) {
        const argumentPath = propertyPath.get("argument");
        instantiateParamBinding(
          argumentPath as NodePath<t.LVal>,
          bodyPath,
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
    instantiateParamBinding(leftPath, bodyPath, functionBuilder, environment);
    return;
  }

  if (nodePath.isRestElement()) {
    const argumentPath = nodePath.get("argument");
    instantiateParamBinding(
      argumentPath as NodePath<t.LVal>,
      bodyPath,
      functionBuilder,
      environment,
    );
    return;
  }

  throw new Error(`Unsupported param type: ${nodePath.type}`);
}

function instantiateIdentifierParamBinding(
  nodePath: NodePath<t.Identifier>,
  bodyPath: NodePath,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const originalName = nodePath.node.name;
  if (bodyPath.scope.data[originalName] !== undefined) {
    return;
  }

  const binding = bodyPath.scope.getBinding(originalName);
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);

  functionBuilder.registerDeclarationName(originalName, identifier.declarationId, bodyPath);
  functionBuilder.instantiateDeclaration(identifier.declarationId, "param", originalName);

  if (binding && isContextVariable(binding, bodyPath)) {
    environment.contextDeclarationIds.add(identifier.declarationId);
  }

  bodyPath.scope.rename(originalName, identifier.name);
  functionBuilder.registerDeclarationName(identifier.name, identifier.declarationId, bodyPath);
  environment.registerDeclaration(
    identifier.declarationId,
    functionBuilder.currentBlock.id,
    place.id,
  );
  functionBuilder.header.push(
    environment.createInstruction(BindingIdentifierInstruction, place, nodePath),
  );
}
