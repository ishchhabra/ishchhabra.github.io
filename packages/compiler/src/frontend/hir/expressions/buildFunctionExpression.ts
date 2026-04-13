import type { Function } from "oxc-parser";
import { Environment } from "../../../environment";
import { FunctionExpressionOp } from "../../../ir/ops/func/FunctionExpression";
import { type Scope } from "../../scope/Scope";
import { buildIdentifier } from "../buildIdentifier";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildFunctionExpression(
  node: Function,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const identifierPlace =
    node.id != null ? buildIdentifier(node.id, scope, functionBuilder, environment) : null;
  if (node.body == null) {
    throw new Error("Function expressions must have a body");
  }

  const childScope = functionBuilder.scopeFor(node);
  const functionIRBuilder = new FunctionIRBuilder(
    node.params,
    node.body,
    childScope,
    functionBuilder.scopeMap,
    functionBuilder.environment,
    moduleBuilder,
    node.async ?? false,
    node.generator ?? false,
  );
  const functionIR = functionIRBuilder.build();

  functionBuilder.propagateCapturesFrom(functionIRBuilder);

  const capturedPlaces = [...functionIRBuilder.captures.values()];
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(
    FunctionExpressionOp,
    place,
    identifierPlace,
    functionIR,
    node.generator ?? false,
    node.async ?? false,
    capturedPlaces,
  );
  functionBuilder.addOp(instruction);
  return place;
}
