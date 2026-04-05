import * as t from "@babel/types";
import { TemplateLiteralInstruction } from "../../../../ir/instructions/value/TemplateLiteral";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateTemplateLiteralInstruction(
  instruction: TemplateLiteralInstruction,
  generator: CodeGenerator,
): t.Expression {
  const expressions = instruction.expressions.map((expr) => {
    const node = generator.places.get(expr.id);
    if (!node) {
      throw new Error(`Place not found for template literal expression: ${expr.id}`);
    }
    t.assertExpression(node);
    return node;
  });

  const quasis = instruction.quasis.map((q) =>
    t.templateElement({ raw: q.value.raw, cooked: q.value.cooked ?? q.value.raw }, q.tail),
  );
  const node = t.templateLiteral(quasis, expressions);
  generator.places.set(instruction.place.id, node);
  return node;
}
