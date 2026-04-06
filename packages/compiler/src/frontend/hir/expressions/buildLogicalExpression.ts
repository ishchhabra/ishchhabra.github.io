import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { LogicalExpressionInstruction } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildLogicalExpression(
  node: ESTree.LogicalExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const leftPlace = buildNode(node.left, scope, functionBuilder, moduleBuilder, environment);
  if (leftPlace === undefined || Array.isArray(leftPlace)) {
    throw new Error("Logical expression left must be a single place");
  }

  const rightPlace = buildNode(node.right, scope, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Logical expression right must be a single place");
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    LogicalExpressionInstruction,
    place,
    node.operator,
    leftPlace,
    rightPlace,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
