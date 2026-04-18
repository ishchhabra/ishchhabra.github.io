import * as t from "@babel/types";
import { JSXClosingElementOp } from "../../../../ir/ops/jsx/JSXClosingElement";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateJSXClosingElementOp(
  instruction: JSXClosingElementOp,
  generator: CodeGenerator,
): t.JSXClosingElement {
  const tagName = generator.values.get(instruction.tagPlace.id);
  if (
    !tagName ||
    (!t.isJSXIdentifier(tagName) &&
      !t.isJSXMemberExpression(tagName) &&
      !t.isJSXNamespacedName(tagName))
  ) {
    throw new Error(`Expected JSX tag name for JSXClosingElement, got ${tagName?.type}`);
  }

  const node = t.jsxClosingElement(tagName);
  generator.values.set(instruction.place.id, node);
  return node;
}
