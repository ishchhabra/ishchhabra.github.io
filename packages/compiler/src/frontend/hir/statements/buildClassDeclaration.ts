import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { StoreLocalInstruction } from "../../../ir";
import { ClassExpressionInstruction } from "../../../ir/instructions/value/ClassExpression";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { getDeclarationOwningPath } from "../getDeclarationOwningPath";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildClassDeclaration(
  nodePath: NodePath<t.ClassDeclaration>,
  functionBuilder: FunctionIRBuilder,
  _moduleBuilder: ModuleIRBuilder,
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

  const classPlace = environment.createPlace(environment.createIdentifier(declarationId));
  const instruction = environment.createInstruction(
    ClassExpressionInstruction,
    classPlace,
    identifierPlace,
  );
  functionBuilder.addInstruction(instruction);
  environment.registerDeclarationInstruction(classPlace, instruction);

  // Explicit StoreLocal to bind the class value to the declaration place.
  const isContext = environment.contextDeclarationIds.has(declarationId);
  const storePlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    environment.createInstruction(
      StoreLocalInstruction,
      storePlace,
      identifierPlace,
      classPlace,
      isContext ? ("let" as const) : ("const" as const),
      [],
    ),
  );

  functionBuilder.markDeclarationInitialized(declarationId);
  return classPlace;
}
