import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { ClassExpressionInstruction } from "../../../ir/instructions/value/ClassExpression";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildClassExpression(
  nodePath: NodePath<t.ClassExpression>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(ClassExpressionInstruction, place, nodePath);
  functionBuilder.addInstruction(instruction);
  return place;
}
