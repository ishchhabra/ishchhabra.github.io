import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildClassDeclarationBindings(
  bindingsPath: NodePath<t.Node>,
  nodePath: NodePath<t.ClassDeclaration>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const parentPath = nodePath.parentPath;
  if (!parentPath.isExportDeclaration() && parentPath !== bindingsPath) {
    return;
  }

  const idNode = nodePath.node.id;
  if (idNode === null) {
    return;
  }

  const identifier = environment.createIdentifier();
  functionBuilder.registerDeclarationName(idNode.name, identifier.declarationId, bindingsPath);

  bindingsPath.scope.rename(idNode.name, identifier.name);
  functionBuilder.registerDeclarationName(identifier.name, identifier.declarationId, bindingsPath);

  const place = environment.createPlace(identifier);
  environment.registerDeclaration(
    identifier.declarationId,
    functionBuilder.currentBlock.id,
    place.id,
  );
}
