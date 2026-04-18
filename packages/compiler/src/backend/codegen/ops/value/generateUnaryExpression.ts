import * as t from "@babel/types";
import { UnaryExpressionOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateUnaryExpressionOp(
  instruction: UnaryExpressionOp,
  generator: CodeGenerator,
): t.UnaryExpression {
  const argument = generator.values.get(instruction.argument.id);
  t.assertExpression(argument);

  const node = t.unaryExpression(instruction.operator, argument);
  generator.values.set(instruction.place.id, node);
  return node;
}
