import * as t from "@babel/types";
import { AwaitExpressionOp } from "../../../../ir/ops/call/AwaitExpression";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateAwaitExpressionOp(
  instruction: AwaitExpressionOp,
  generator: CodeGenerator,
): t.Expression {
  const argument = generator.places.get(instruction.argument.id);
  if (!argument) {
    throw new Error(`Place not found for await argument: ${instruction.argument.id}`);
  }
  t.assertExpression(argument);

  const node = t.awaitExpression(argument);
  generator.places.set(instruction.place.id, node);
  return node;
}
