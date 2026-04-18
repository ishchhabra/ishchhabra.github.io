import * as t from "@babel/types";
import { FunctionExpressionOp } from "../../../../ir/ops/func/FunctionExpression";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateFunction } from "../../generateFunction";

export function generateFunctionExpressionOp(
  instruction: FunctionExpressionOp,
  generator: CodeGenerator,
): t.FunctionExpression {
  const idNode = instruction.binding ? generator.values.get(instruction.binding.id) : null;
  if (idNode !== null && !t.isIdentifier(idNode)) {
    throw new Error("Function expression identifier is not an identifier");
  }

  const { params, statements } = generateFunction(
    instruction.funcOp,
    instruction.captures,
    generator,
  );
  const node = t.functionExpression(
    idNode,
    params,
    t.blockStatement(statements),
    instruction.generator,
    instruction.async,
  );
  generator.values.set(instruction.place.id, node);
  return node;
}
