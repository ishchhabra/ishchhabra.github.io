import * as t from "@babel/types";
import { ConditionalExpressionOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateConditionalExpressionOp(
  instruction: ConditionalExpressionOp,
  generator: CodeGenerator,
): t.Expression {
  const test = generator.values.get(instruction.test.id);
  if (test === undefined) {
    throw new Error(`Value ${instruction.test.id} not found`);
  }
  const consequent = generator.values.get(instruction.consequent.id);
  if (consequent === undefined) {
    throw new Error(`Value ${instruction.consequent.id} not found`);
  }
  const alternate = generator.values.get(instruction.alternate.id);
  if (alternate === undefined) {
    throw new Error(`Value ${instruction.alternate.id} not found`);
  }

  t.assertExpression(test);
  t.assertExpression(consequent);
  t.assertExpression(alternate);

  const node = t.conditionalExpression(test, consequent, alternate);
  generator.values.set(instruction.place.id, node);
  return node;
}
