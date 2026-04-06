import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { Place } from "../../../ir";
import { ArrowFunctionExpressionInstruction } from "../../../ir/instructions/value/ArrowFunctionExpression";
import { isExpression } from "../../estree";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildArrowFunctionExpression(
  node: ESTree.ArrowFunctionExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const body = node.body;
  const scopeNode = isExpression(body) ? node : body;
  const childScope = functionBuilder.scopeFor(node);
  const functionIRBuilder = new FunctionIRBuilder(
    node.params,
    scopeNode,
    body,
    childScope,
    functionBuilder.scopeMap,
    functionBuilder.environment,
    moduleBuilder,
    node.async ?? false,
    false,
  );
  const functionIR = functionIRBuilder.build();

  functionBuilder.propagateCapturesFrom(functionIRBuilder);

  const capturedPlaces = [...functionIRBuilder.captures.values()];
  const identifier = environment.createIdentifier(undefined, scope.allocateName());
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ArrowFunctionExpressionInstruction,
    place,
    functionIR,
    node.async ?? false,
    isExpression(body),
    false,
    capturedPlaces,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
