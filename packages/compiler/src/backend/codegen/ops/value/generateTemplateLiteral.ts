import * as t from "@babel/types";
import { TemplateLiteralOp } from "../../../../ir/ops/prim/TemplateLiteral";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateTemplateLiteralOp(
  instruction: TemplateLiteralOp,
  generator: CodeGenerator,
): t.Expression {
  const expressions = instruction.expressions.map((expr) => {
    const node = generator.values.get(expr.id);
    if (!node) {
      throw new Error(`Value not found for template literal expression: ${expr.id}`);
    }
    t.assertExpression(node);
    return node;
  });

  const quasis = instruction.quasis.map((q) =>
    t.templateElement({ raw: q.value.raw, cooked: q.value.cooked ?? q.value.raw }, q.tail),
  );
  const node = t.templateLiteral(quasis, expressions);
  generator.values.set(instruction.place.id, node);
  return node;
}
