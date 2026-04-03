import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { Place } from "../../../ir";
import { ArrowFunctionExpressionInstruction } from "../../../ir/instructions/value/ArrowFunctionExpression";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildArrowFunctionExpression(
  nodePath: NodePath<t.ArrowFunctionExpression>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const paramPaths = nodePath.get("params");
  const bodyPath = nodePath.get("body");
  const scopePath = bodyPath.isExpression() ? nodePath : bodyPath;
  const functionIRBuilder = new FunctionIRBuilder(
    paramPaths,
    scopePath,
    bodyPath,
    functionBuilder.environment,
    moduleBuilder,
    nodePath.node.async,
    false,
  );
  const functionIR = functionIRBuilder.build();

  functionBuilder.propagateCapturesFrom(functionIRBuilder);

  const capturedPlaces = [...functionIRBuilder.captures.values()];
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ArrowFunctionExpressionInstruction,
    place,
    functionIR,
    nodePath.node.async,
    bodyPath.isExpression(),
    false,
    capturedPlaces,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
