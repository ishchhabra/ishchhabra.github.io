import * as t from "@babel/types";
import { AwaitExpressionOp } from "../../../../ir/ops/call/AwaitExpression";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateAwaitExpressionOp(
  instruction: AwaitExpressionOp,
  generator: CodeGenerator,
): t.Expression {
  const argument = generator.values.get(instruction.argument.id);
  if (!argument) {
    throw new Error(`Value not found for await argument: ${instruction.argument.id}`);
  }
  t.assertExpression(argument);

  const node = t.awaitExpression(argument);
  generator.values.set(instruction.place.id, node);
  return node;
}
