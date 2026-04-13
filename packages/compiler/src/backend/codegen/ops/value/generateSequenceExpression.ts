import * as t from "@babel/types";
import { SequenceExpressionOp } from "../../../../ir/ops/arith/SequenceExpression";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateSequenceExpressionOp(
  instruction: SequenceExpressionOp,
  generator: CodeGenerator,
): t.Expression {
  const expressions = instruction.expressions.map((expr) => {
    const node = generator.places.get(expr.id);
    if (!node) {
      throw new Error(`Place not found for sequence expression element: ${expr.id}`);
    }
    t.assertExpression(node);
    return node;
  });

  const node = t.sequenceExpression(expressions);
  generator.places.set(instruction.place.id, node);
  return node;
}
