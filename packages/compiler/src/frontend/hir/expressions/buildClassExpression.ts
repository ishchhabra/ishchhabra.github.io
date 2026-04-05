import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { ClassExpressionInstruction } from "../../../ir/instructions/value/ClassExpression";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildClassExpression(
  _node: ESTree.ClassExpression,
  _scope: unknown,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(ClassExpressionInstruction, place);
  functionBuilder.addInstruction(instruction);
  return place;
}
