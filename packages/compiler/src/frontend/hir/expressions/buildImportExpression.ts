import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { ImportExpressionInstruction, Place } from "../../../ir";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildImportExpression(
  expressionPath: NodePath<t.CallExpression>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const argumentsPath = expressionPath.get("arguments");
  if (argumentsPath.length === 0) {
    throw new Error("Dynamic import requires a source argument");
  }

  const sourcePath = argumentsPath[0];
  const sourcePlace = buildNode(sourcePath, functionBuilder, moduleBuilder, environment);
  if (sourcePlace === undefined || Array.isArray(sourcePlace)) {
    throw new Error("Dynamic import source must be a single place");
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ImportExpressionInstruction,
    place,
    sourcePlace,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
