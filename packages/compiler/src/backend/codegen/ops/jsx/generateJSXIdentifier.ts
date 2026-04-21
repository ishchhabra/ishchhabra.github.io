import * as t from "@babel/types";
import { JSXIdentifierOp } from "../../../../ir/ops/jsx/JSXIdentifier";
import { CodeGenerator } from "../../../CodeGenerator";

/** Tag value places lower to `StringLiteral`, `Identifier`, or already-`JSXIdentifier`. */
function valueNodeToJSXIdentifier(inner: t.Node): t.JSXIdentifier {
  if (t.isJSXIdentifier(inner)) {
    return inner;
  }
  if (t.isStringLiteral(inner)) {
    return t.jsxIdentifier(inner.value);
  }
  if (t.isIdentifier(inner)) {
    return t.jsxIdentifier(inner.name);
  }
  throw new Error(
    `Expected string literal, identifier, or JSXIdentifier for JSX tag value, got ${inner.type}`,
  );
}

export function generateJSXIdentifierOp(
  instruction: JSXIdentifierOp,
  generator: CodeGenerator,
): t.JSXIdentifier {
  const inner = generator.values.get(instruction.value.id);
  if (inner === undefined || inner === null) {
    throw new Error("JSXIdentifierOp: value place not generated yet");
  }

  const tagName = valueNodeToJSXIdentifier(inner);
  generator.values.set(instruction.place.id, tagName);
  return tagName;
}
