import type * as AST from "../../estree";
import { Environment } from "../../../environment";
import { BinaryExpressionOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildBinaryExpression(
  node: AST.BinaryExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
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

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(
    BinaryExpressionOp,
    place,
    node.operator,
    leftPlace,
    rightPlace,
  );
  functionBuilder.addOp(instruction);
  return place;
}
