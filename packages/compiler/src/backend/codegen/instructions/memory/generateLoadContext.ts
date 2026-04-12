import * as t from "@babel/types";
import { LoadContextInstruction } from "../../../../ir/instructions/memory/LoadContext";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateLoadContextInstruction(
  instruction: LoadContextInstruction,
  generator: CodeGenerator,
): t.Expression {
  let node = generator.places.get(instruction.value.id);
  if (node === undefined || node === null) {
    node = generator.getPlaceIdentifier(instruction.value);
  }

  const expression = t.isFunctionDeclaration(node) ? node.id : node;
  t.assertExpression(expression);
  generator.places.set(instruction.place.id, expression);
  return expression;
}
