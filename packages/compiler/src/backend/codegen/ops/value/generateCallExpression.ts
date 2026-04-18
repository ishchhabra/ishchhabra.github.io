import * as t from "@babel/types";
import { CallExpressionOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateCallExpression(
  instruction: CallExpressionOp,
  generator: CodeGenerator,
): t.Expression {
  const callee = generator.values.get(instruction.callee.id);
  if (callee === undefined) {
    throw new Error(`Value ${instruction.callee.id} not found`);
  }

  t.assertExpression(callee);

  const args = instruction.args.map((argument) => {
    const node = generator.values.get(argument.id);
    if (node == null) {
      throw new Error(`Value ${argument.id} not found`);
    }

    if (!t.isExpression(node) && !t.isSpreadElement(node)) {
      throw new Error(`Expected Expression or SpreadElement but got ${node.type}`);
    }
    return node;
  });

  const inOptionalChain =
    instruction.optional ||
    t.isOptionalMemberExpression(callee) ||
    t.isOptionalCallExpression(callee);
  const node = inOptionalChain
    ? t.optionalCallExpression(callee, args, instruction.optional)
    : t.callExpression(callee, args);
  generator.values.set(instruction.place.id, node);
  return node;
}
