import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { ThisExpressionInstruction } from "../../../ir/instructions/value/ThisExpression";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildThisExpression(
  _node: ESTree.ThisExpression,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const identifier = environment.createIdentifier(undefined, functionBuilder.scope.allocateName());
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(ThisExpressionInstruction, place);
  functionBuilder.addInstruction(instruction);
  return place;
}
