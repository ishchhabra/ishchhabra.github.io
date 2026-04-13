import type { AwaitExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { AwaitExpressionOp } from "../../../ir/ops/call/AwaitExpression";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildAwaitExpression(
  node: AwaitExpression,
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
    throw new Error("Await expression argument must be a single place");
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(AwaitExpressionOp, place, argumentPlace);
  functionBuilder.addOp(instruction);
  return place;
}
