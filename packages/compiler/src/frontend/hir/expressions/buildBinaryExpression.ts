import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { BinaryExpressionInstruction } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildBinaryExpression(
  node: ESTree.BinaryExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const left = node.left;
  if (left.type === "PrivateIdentifier") {
    throw new Error("PrivateIdentifier in binary expression is not supported");
  }
  const leftPlace = buildNode(left, scope, functionBuilder, moduleBuilder, environment);
  if (leftPlace === undefined || Array.isArray(leftPlace)) {
    throw new Error("Binary expression left must be a single place");
  }

  const rightPlace = buildNode(node.right, scope, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Binary expression right must be a single place");
  }

  const identifier = environment.createIdentifier(undefined, scope.allocateName());
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    BinaryExpressionInstruction,
    place,
    node.operator,
    leftPlace,
    rightPlace,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
