import * as t from "@babel/types";
import { JSXIdentifierInstruction } from "../../../../ir/instructions/jsx/JSXIdentifier";
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

export function generateJSXIdentifierInstruction(
  instruction: JSXIdentifierInstruction,
  generator: CodeGenerator,
): t.JSXIdentifier {
  const inner = generator.places.get(instruction.value.id);
  if (inner === undefined || inner === null) {
    throw new Error("JSXIdentifierInstruction: value place not generated yet");
  }

  const tagName = valueNodeToJSXIdentifier(inner);
  generator.places.set(instruction.place.id, tagName);
  return tagName;
}
