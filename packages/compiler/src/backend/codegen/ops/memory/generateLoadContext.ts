import * as t from "@babel/types";
import { LoadContextOp } from "../../../../ir/ops/mem/LoadContext";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateLoadContextOp(
  instruction: LoadContextOp,
  generator: CodeGenerator,
): t.Expression {
  let node = generator.values.get(instruction.value.id);
  if (node === undefined || node === null) {
    node = generator.getPlaceIdentifier(instruction.value);
  }

  const expression = t.isFunctionDeclaration(node)
    ? node.id
    : t.isClassDeclaration(node) && node.id
      ? node.id
      : node;
  t.assertExpression(expression);
  generator.values.set(instruction.place.id, expression);
  return expression;
}
