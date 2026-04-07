import * as t from "@babel/types";
import { LoadContextInstruction } from "../../../../ir/instructions/memory/LoadContext";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateLoadContextInstruction(
  instruction: LoadContextInstruction,
  generator: CodeGenerator,
): t.Expression {
  const node = generator.places.get(instruction.value.id);
  if (!node) {
    throw new Error(`Place ${instruction.value.id} not found for LoadContext value`);
  }

  const expression = t.isFunctionDeclaration(node) ? node.id : node;
  t.assertExpression(expression);
  generator.places.set(instruction.place.id, expression);
  return expression;
}
