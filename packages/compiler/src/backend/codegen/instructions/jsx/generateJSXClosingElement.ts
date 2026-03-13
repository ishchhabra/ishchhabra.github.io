import * as t from "@babel/types";
import { JSXClosingElementInstruction } from "../../../../ir/instructions/jsx/JSXClosingElement";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateJSXClosingElementInstruction(
  instruction: JSXClosingElementInstruction,
  generator: CodeGenerator,
): t.JSXClosingElement {
  const tagName = generator.places.get(instruction.tagPlace.id);
  if (!tagName || (!t.isJSXIdentifier(tagName) && !t.isJSXMemberExpression(tagName) && !t.isJSXNamespacedName(tagName))) {
    throw new Error(`Expected JSX tag name for JSXClosingElement, got ${tagName?.type}`);
  }

  const node = t.jsxClosingElement(tagName);
  generator.places.set(instruction.place.id, node);
  return node;
}
