import * as t from "@babel/types";
import { NewExpressionOp } from "../../../../ir/ops/call/NewExpression";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateNewExpressionOp(
  instruction: NewExpressionOp,
  generator: CodeGenerator,
): t.Expression {
  const callee = generator.values.get(instruction.callee.id);
  if (!callee) {
    throw new Error(`Value not found for new expression callee: ${instruction.callee.id}`);
  }
  t.assertExpression(callee);

  const args = instruction.args.map((argument) => {
    const node = generator.values.get(argument.id);
    if (!node) {
      throw new Error(`Value not found for new expression argument: ${argument.id}`);
    }
    if (!t.isExpression(node) && !t.isSpreadElement(node)) {
      throw new Error(`Expected Expression or SpreadElement but got ${node.type}`);
    }
    return node;
  });

  const node = t.newExpression(callee, args);
  generator.values.set(instruction.place.id, node);
  return node;
}
