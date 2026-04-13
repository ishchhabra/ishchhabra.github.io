import type { YieldExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { YieldExpressionOp } from "../../../ir/ops/call/YieldExpression";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildYieldExpression(
  node: YieldExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  let argumentPlace;
  if (node.argument != null) {
    argumentPlace = buildNode(node.argument, scope, functionBuilder, moduleBuilder, environment);
    if (argumentPlace === undefined || Array.isArray(argumentPlace)) {
      throw new Error("Yield expression argument must be a single place");
    }
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(
    YieldExpressionOp,
    place,
    argumentPlace,
    node.delegate,
  );
  functionBuilder.addOp(instruction);
  return place;
}
