import * as t from "@babel/types";
import { ArrayExpressionOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateArrayExpressionOp(
  instruction: ArrayExpressionOp,
  generator: CodeGenerator,
): t.Expression {
  const elements = instruction.elements.map((element) => {
    const node = generator.values.get(element.id);
    if (node === undefined) {
      throw new Error(`Value ${element.id} not found`);
    }

    if (node === null || t.isSpreadElement(node)) {
      return node;
    }

    t.assertExpression(node);
    return node;
  });

  const node = t.arrayExpression(elements);
  generator.values.set(instruction.place.id, node);
  return node;
}
