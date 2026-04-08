import type { ThisExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { ThisExpressionInstruction } from "../../../ir/instructions/value/ThisExpression";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildThisExpression(
  _node: ThisExpression,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(ThisExpressionInstruction, place);
  functionBuilder.addInstruction(instruction);
  return place;
}
