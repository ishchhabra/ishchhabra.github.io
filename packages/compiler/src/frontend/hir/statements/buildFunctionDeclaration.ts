import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { FunctionDeclarationInstruction } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { getDeclarationOwningPath } from "../getDeclarationOwningPath";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildFunctionDeclaration(
  nodePath: NodePath<t.FunctionDeclaration>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const idPath = nodePath.get("id");
  if (!idPath.isIdentifier()) {
    throw new Error("Invalid function declaration");
  }

  const paramPaths = nodePath.get("params");
  const bodyPath = nodePath.get("body");
  const functionIRBuilder = new FunctionIRBuilder(
    paramPaths,
    bodyPath,
    bodyPath,
    functionBuilder.environment,
    moduleBuilder,
    nodePath.node.async,
    nodePath.node.generator,
  );
  const functionIR = functionIRBuilder.build();

  functionBuilder.propagateCapturesFrom(functionIRBuilder);
  const capturedPlaces = [...functionIRBuilder.captures.values()];

  const declarationId = functionBuilder.getDeclarationId(
    idPath.node.name,
    getDeclarationOwningPath(nodePath),
  );
  if (declarationId === undefined) {
    throw new Error(`Function declaration binding was not instantiated: ${idPath.node.name}`);
  }

  const latestDeclaration = environment.getLatestDeclaration(declarationId);
  const identifierPlace = environment.places.get(latestDeclaration.placeId);
  if (identifierPlace === undefined) {
    throw new Error(`Unable to find the place for ${idPath.node.name} (${declarationId})`);
  }

  const place = environment.createPlace(environment.createIdentifier(declarationId));
  const instruction = environment.createInstruction(
    FunctionDeclarationInstruction,
    place,
    nodePath,
    identifierPlace,
    functionIR,
    nodePath.node.generator,
    nodePath.node.async,
    capturedPlaces,
  );
  functionBuilder.addInstruction(instruction);
  environment.registerDeclarationInstruction(place, instruction);
  return place;
}
