import * as t from "@babel/types";
import { JSXElementOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateJSXElementOp(instruction: JSXElementOp, generator: CodeGenerator) {
  const openingElement = generator.values.get(instruction.openingElement.id);
  t.assertJSXOpeningElement(openingElement);

  let closingElement = null;
  if (instruction.closingElement !== undefined) {
    closingElement = generator.values.get(instruction.closingElement.id);
    t.assertJSXClosingElement(closingElement);
  }

  const children = instruction.children.map((child) => {
    const node = generator.values.get(child.id);
    if (
      t.isJSXText(node) ||
      t.isJSXExpressionContainer(node) ||
      t.isJSXSpreadChild(node) ||
      t.isJSXElement(node) ||
      t.isJSXFragment(node)
    ) {
      return node;
    }
    t.assertExpression(node);
    return t.jsxExpressionContainer(node);
  });

  const selfClosing = closingElement === null;
  const node = t.jsxElement(openingElement, closingElement, children, selfClosing);
  generator.values.set(instruction.place.id, node);
  return node;
}
