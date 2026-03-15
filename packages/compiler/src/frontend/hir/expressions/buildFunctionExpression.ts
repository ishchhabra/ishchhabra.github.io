import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { FunctionExpressionInstruction } from "../../../ir/instructions/value/FunctionExpression";
import { buildIdentifier } from "../buildIdentifier";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildFunctionExpression(
  nodePath: NodePath<t.FunctionExpression>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const idPath: NodePath<t.FunctionExpression["id"]> = nodePath.get("id");
  if (idPath.hasNode() && !idPath.isIdentifier()) {
    throw new Error("Function expression identifier is not an identifier");
  }

  const identifierPlace = idPath.hasNode()
    ? buildIdentifier(idPath, functionBuilder, environment)
    : null;

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
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    FunctionExpressionInstruction,
    place,
    nodePath,
    identifierPlace,
    functionIR,
    nodePath.node.generator,
    nodePath.node.async,
    capturedPlaces,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
