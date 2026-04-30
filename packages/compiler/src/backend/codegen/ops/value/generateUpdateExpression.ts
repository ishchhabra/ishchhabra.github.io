import * as t from "@babel/types";
import { UpdateExpressionOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateAssignmentTarget } from "./generateAssignmentExpression";

export function generateUpdateExpressionOp(
  instruction: UpdateExpressionOp,
  generator: CodeGenerator,
): t.UpdateExpression {
  const argument = generateAssignmentTarget(instruction.target, generator);
  t.assertExpression(argument);
  const node = t.updateExpression(instruction.operator, argument, instruction.prefix);
  generator.values.set(instruction.place.id, node);
  return node;
}
