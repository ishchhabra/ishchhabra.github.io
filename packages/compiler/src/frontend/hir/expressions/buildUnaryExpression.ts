import type * as AST from "../../estree";
import { Environment } from "../../../environment";
import { UnaryExpressionInstruction } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildUnaryExpression(
  node: AST.UnaryExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const argumentPlace = buildNode(
    node.argument,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
  );
  if (argumentPlace === undefined || Array.isArray(argumentPlace)) {
    throw new Error("Unary expression argument must be a single place");
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    UnaryExpressionInstruction,
    place,
    node.operator,
    argumentPlace,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
