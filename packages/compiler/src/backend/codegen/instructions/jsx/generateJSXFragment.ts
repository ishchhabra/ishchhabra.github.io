import * as t from "@babel/types";
import { JSXFragmentInstruction } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateJSXFragmentInstruction(
  instruction: JSXFragmentInstruction,
  generator: CodeGenerator,
) {
  const openingFragment = generator.places.get(instruction.openingFragment.id);
  t.assertJSXOpeningFragment(openingFragment);

  const closingFragment = generator.places.get(instruction.closingFragment.id);
  t.assertJSXClosingFragment(closingFragment);

  const children = instruction.children.map((child) => {
    const node = generator.places.get(child.id);
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

  const node = t.jsxFragment(openingFragment, closingFragment, children);
  generator.places.set(instruction.place.id, node);
  return node;
}
