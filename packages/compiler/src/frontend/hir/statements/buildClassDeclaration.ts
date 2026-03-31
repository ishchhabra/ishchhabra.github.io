import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { ClassDeclarationInstruction } from "../../../ir/instructions/declaration/Class";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { getDeclarationOwningPath } from "../getDeclarationOwningPath";
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

  const declarationId = functionBuilder.getDeclarationId(
    idPath.node.name,
    getDeclarationOwningPath(nodePath),
  );
  if (declarationId === undefined) {
    throw new Error(`Class declaration binding was not instantiated: ${idPath.node.name}`);
  }

  const latestDeclaration = environment.getLatestDeclaration(declarationId);
  const identifierPlace = environment.places.get(latestDeclaration.placeId);
  if (identifierPlace === undefined) {
    throw new Error(`Unable to find the place for ${idPath.node.name} (${declarationId})`);
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
