import * as t from "@babel/types";
import { ConditionalExpressionInstruction } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateConditionalExpressionInstruction(
  instruction: ConditionalExpressionInstruction,
  generator: CodeGenerator,
): t.Expression {
  const test = generator.places.get(instruction.test.id);
  if (test === undefined) {
    throw new Error(`Place ${instruction.test.id} not found`);
  }

  const consequent = generator.places.get(instruction.consequent.id);
  if (consequent === undefined) {
    throw new Error(`Place ${instruction.consequent.id} not found`);
  }

  const alternate = generator.places.get(instruction.alternate.id);
  if (alternate === undefined) {
    throw new Error(`Place ${instruction.alternate.id} not found`);
  }

  t.assertExpression(test);
  t.assertExpression(consequent);
  t.assertExpression(alternate);

  const node = t.conditionalExpression(test, consequent, alternate);
  generator.places.set(instruction.place.id, node);
  return node;
}
