import type * as AST from "../../estree";
import { Environment } from "../../../environment";
import { LiteralOp, TPrimitiveValue } from "../../../ir";
import { FuncOpBuilder } from "../FuncOpBuilder";

export function buildLiteral(
  node: AST.Literal,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
) {
  const value = nodeToValue(node);

  const place = environment.createValue();
  const instruction = environment.createOperation(LiteralOp, place, value);
  functionBuilder.addOp(instruction);
  return place;
}

function nodeToValue(node: AST.Literal): TPrimitiveValue {
  // ESTree BigIntLiteral has a `bigint` property with the string representation
  if ("bigint" in node && node.bigint !== undefined) {
    return BigInt(node.bigint);
  }

  // ESTree RegExpLiteral — should not reach here (handled by buildRegExpLiteral)
  if ("regex" in node) {
    throw new Error("RegExp literals should be handled by buildRegExpLiteral");
  }

  // value is string | number | boolean | null
  return node.value as TPrimitiveValue;
}
