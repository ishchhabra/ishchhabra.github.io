import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { LiteralInstruction, TPrimitiveValue } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildLiteral(
  node: ESTree.Literal,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const value = nodeToValue(node);

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(LiteralInstruction, place, value);
  functionBuilder.addInstruction(instruction);
  environment.registerDeclarationInstruction(place, instruction);
  return place;
}

function nodeToValue(node: ESTree.Literal): TPrimitiveValue {
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
