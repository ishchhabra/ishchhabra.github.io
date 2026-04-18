import * as t from "@babel/types";
import { ThisExpressionOp } from "../../../../ir/ops/prop/ThisExpression";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateThisExpressionOp(
  instruction: ThisExpressionOp,
  generator: CodeGenerator,
): t.Expression {
  const node = t.thisExpression();
  generator.values.set(instruction.place.id, node);
  return node;
}
