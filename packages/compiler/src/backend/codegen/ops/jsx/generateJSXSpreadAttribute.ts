import * as t from "@babel/types";
import { JSXSpreadAttributeOp } from "../../../../ir/ops/jsx/JSXSpreadAttribute";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateJSXSpreadAttributeOp(
  instruction: JSXSpreadAttributeOp,
  generator: CodeGenerator,
): t.JSXSpreadAttribute {
  const argumentNode = generator.values.get(instruction.argument.id);
  if (!argumentNode) {
    throw new Error(
      `Value not found for JSX spread attribute argument: ${instruction.argument.id}`,
    );
  }
  t.assertExpression(argumentNode);

  const node = t.jsxSpreadAttribute(argumentNode);
  generator.values.set(instruction.place.id, node);
  return node;
}
