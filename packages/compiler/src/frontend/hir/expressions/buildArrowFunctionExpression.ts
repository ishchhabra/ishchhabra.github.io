import type { ArrowFunctionExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { Place } from "../../../ir";
import { ArrowFunctionExpressionInstruction } from "../../../ir/instructions/value/ArrowFunctionExpression";
import { isExpression, unwrapTSTypeWrappers } from "../../estree";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildArrowFunctionExpression(
  node: ArrowFunctionExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const body = node.body;
  const conciseExpressionBody = isExpression(unwrapTSTypeWrappers(body));
  const childScope = functionBuilder.scopeFor(node);
  const functionIRBuilder = new FunctionIRBuilder(
    node.params,
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
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ArrowFunctionExpressionInstruction,
    place,
    functionIR,
    node.async ?? false,
    conciseExpressionBody,
    false,
    capturedPlaces,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
