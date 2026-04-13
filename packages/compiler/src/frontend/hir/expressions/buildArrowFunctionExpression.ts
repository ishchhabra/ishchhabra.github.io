import type { ArrowFunctionExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { Place } from "../../../ir";
import { ArrowFunctionExpressionOp } from "../../../ir/ops/func/ArrowFunctionExpression";
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
  const instruction = environment.createOperation(
    ArrowFunctionExpressionOp,
    place,
    functionIR,
    node.async ?? false,
    conciseExpressionBody,
    false,
    capturedPlaces,
  );
  functionBuilder.addOp(instruction);
  return place;
}
