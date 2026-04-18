import * as t from "@babel/types";
import { JSXOpeningElementOp } from "../../../../ir/ops/jsx/JSXOpeningElement";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateJSXOpeningElementOp(
  instruction: JSXOpeningElementOp,
  generator: CodeGenerator,
): t.JSXOpeningElement {
  const tagName = generator.values.get(instruction.tagPlace.id);
  if (
    !tagName ||
    (!t.isJSXIdentifier(tagName) &&
      !t.isJSXMemberExpression(tagName) &&
      !t.isJSXNamespacedName(tagName))
  ) {
    throw new Error(`Expected JSX tag name for JSXOpeningElement, got ${tagName?.type}`);
  }

  const attributes = instruction.attributes.map((attrPlace) => {
    const attrNode = generator.values.get(attrPlace.id);
    if (!attrNode) {
      throw new Error(`Value not found for JSX attribute: ${attrPlace.id}`);
    }
    if (t.isJSXAttribute(attrNode)) {
      return attrNode;
    }
    if (t.isJSXSpreadAttribute(attrNode)) {
      return attrNode;
    }
    t.assertExpression(attrNode);
    return t.jsxSpreadAttribute(attrNode);
  });

  const node = t.jsxOpeningElement(tagName, attributes, instruction.selfClosing);
  generator.values.set(instruction.place.id, node);
  return node;
}
