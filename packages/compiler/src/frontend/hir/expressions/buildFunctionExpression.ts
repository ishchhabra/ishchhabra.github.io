import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { FunctionExpressionInstruction } from "../../../ir/instructions/value/FunctionExpression";
import { type Scope } from "../../scope/Scope";
import { buildIdentifier } from "../buildIdentifier";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildFunctionExpression(
  node: ESTree.FunctionExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const identifierPlace =
    node.id != null ? buildIdentifier(node.id, scope, functionBuilder, environment) : null;

  const childScope = functionBuilder.scopeFor(node);
  const functionIRBuilder = new FunctionIRBuilder(
    node.params,
    node.body,
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
  const identifier = environment.createIdentifier(undefined, scope.allocateName());
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    FunctionExpressionInstruction,
    place,
    identifierPlace,
    functionIR,
    node.generator ?? false,
    node.async ?? false,
    capturedPlaces,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
