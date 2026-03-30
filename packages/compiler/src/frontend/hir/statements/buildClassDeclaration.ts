import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { ClassDeclarationInstruction } from "../../../ir/instructions/declaration/Class";
import { buildIdentifier } from "../buildIdentifier";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildClassDeclaration(
  nodePath: NodePath<t.ClassDeclaration>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const idPath = nodePath.get("id");
  if (!idPath.isIdentifier()) {
    throw new Error("Invalid class declaration: missing id");
  }

  const identifierPlace = buildIdentifier(idPath, functionBuilder, environment);

  const declarationId = functionBuilder.getDeclarationId(idPath.node.name, nodePath);
  if (declarationId === undefined) {
    throw new Error(`Class accessed before declaration: ${idPath.node.name}`);
  }

  const place = environment.createPlace(environment.createIdentifier(declarationId));
  const instruction = environment.createInstruction(
    ClassDeclarationInstruction,
    place,
    nodePath,
    identifierPlace,
  );
  functionBuilder.addInstruction(instruction);
  environment.registerDeclarationInstruction(place, instruction);
  functionBuilder.markDeclarationInitialized(declarationId);
  return place;
}
