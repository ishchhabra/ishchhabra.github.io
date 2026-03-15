import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { getFunctionName } from "../../../babel-utils";
import { Environment } from "../../../environment";
import { FunctionDeclarationInstruction } from "../../../ir";
import { buildIdentifier } from "../buildIdentifier";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
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

  const identifierPlace = buildIdentifier(idPath, functionBuilder, environment);

  const paramPaths = nodePath.get("params");
  const bodyPath = nodePath.get("body");
  const functionIRBuilder = new FunctionIRBuilder(
    paramPaths,
    bodyPath,
    functionBuilder.environment,
    moduleBuilder,
  );
  const functionIR = functionIRBuilder.build();

  functionBuilder.propagateCapturesFrom(functionIRBuilder);
  const capturedPlaces = [...functionIRBuilder.captures.values()];

  const functionName = getFunctionName(nodePath);
  if (functionName === null) {
    throw new Error("Invalid function declaration");
  }

  const declarationId = functionBuilder.getDeclarationId(functionName.node.name, nodePath);
  if (declarationId === undefined) {
    throw new Error(`Function accessed before declaration: ${functionName.node.name}`);
  }

  const latestDeclaration = environment.getLatestDeclaration(declarationId)!;
  const functionPlace = environment.places.get(latestDeclaration.placeId)!;
  if (functionPlace === undefined) {
    throw new Error(`Unable to find the place for ${functionName.node.name} (${declarationId})`);
  }

  const instruction = environment.createInstruction(
    FunctionDeclarationInstruction,
    functionPlace,
    nodePath,
    identifierPlace,
    functionIR,
    nodePath.node.generator,
    nodePath.node.async,
    capturedPlaces,
  );
  functionBuilder.addInstruction(instruction);
  environment.registerDeclarationInstruction(identifierPlace, instruction);
  return functionPlace;
}
