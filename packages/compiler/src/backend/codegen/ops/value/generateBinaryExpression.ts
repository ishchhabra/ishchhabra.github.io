import * as t from "@babel/types";
import { BinaryExpressionOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateBinaryExpressionOp(
  instruction: BinaryExpressionOp,
  generator: CodeGenerator,
): t.Expression {
  const left = generator.values.get(instruction.left.id);
  if (left === undefined) {
    throw new Error(`Value ${instruction.left.id} not found`);
  }

  const right = generator.values.get(instruction.right.id);
  if (right === undefined) {
    throw new Error(`Value ${instruction.right.id} not found`);
  }

  t.assertExpression(left);
  t.assertExpression(right);

  const node = t.binaryExpression(instruction.operator, left, right);
  generator.values.set(instruction.place.id, node);
  return node;
}
