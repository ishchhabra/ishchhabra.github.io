import * as t from "@babel/types";
import { FunctionExpressionOp } from "../../../../ir/ops/func/FunctionExpression";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateFunction } from "../../generateFunction";

export function generateFunctionExpressionOp(
  instruction: FunctionExpressionOp,
  generator: CodeGenerator,
): t.FunctionExpression {
  const idNode = instruction.name !== null ? t.identifier(instruction.name) : null;

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
