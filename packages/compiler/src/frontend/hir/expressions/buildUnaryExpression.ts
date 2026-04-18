import type { UnaryExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { UnaryExpressionOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildUnaryExpression(
  node: UnaryExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
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

  const place = environment.createValue();
  const instruction = environment.createOperation(
    UnaryExpressionOp,
    place,
    node.operator,
    argumentPlace,
  );
  functionBuilder.addOp(instruction);
  return place;
}
