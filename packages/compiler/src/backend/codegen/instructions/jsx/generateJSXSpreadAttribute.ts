import * as t from "@babel/types";
import { JSXSpreadAttributeInstruction } from "../../../../ir/instructions/jsx/JSXSpreadAttribute";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateJSXSpreadAttributeInstruction(
  instruction: JSXSpreadAttributeInstruction,
  generator: CodeGenerator,
): t.JSXSpreadAttribute {
  const argumentNode = generator.places.get(instruction.argument.id);
  if (!argumentNode) {
    throw new Error(
      `Place not found for JSX spread attribute argument: ${instruction.argument.id}`,
    );
  }
  t.assertExpression(argumentNode);

  const node = t.jsxSpreadAttribute(argumentNode);
  generator.places.set(instruction.place.id, node);
  return node;
}
