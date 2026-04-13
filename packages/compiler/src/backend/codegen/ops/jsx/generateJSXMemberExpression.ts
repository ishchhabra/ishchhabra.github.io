import * as t from "@babel/types";
import { JSXMemberExpressionOp } from "../../../../ir/ops/jsx/JSXMemberExpression";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateJSXMemberExpressionOp(
  instruction: JSXMemberExpressionOp,
  generator: CodeGenerator,
): t.JSXMemberExpression {
  const object = generator.places.get(instruction.object.id);
  if (object === undefined) {
    throw new Error(`Place ${instruction.object.id} not found for JSX member expression object`);
  }
  if (!t.isJSXIdentifier(object) && !t.isJSXMemberExpression(object)) {
    throw new Error(
      `Expected JSXIdentifier or JSXMemberExpression for JSX member expression object`,
    );
  }

  const node = t.jsxMemberExpression(object, t.jsxIdentifier(instruction.property));
  generator.places.set(instruction.place.id, node);
  return node;
}
