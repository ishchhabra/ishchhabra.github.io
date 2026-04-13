import type { ThisExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { ThisExpressionOp } from "../../../ir/ops/prop/ThisExpression";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildThisExpression(
  _node: ThisExpression,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(ThisExpressionOp, place);
  functionBuilder.addOp(instruction);
  return place;
}
