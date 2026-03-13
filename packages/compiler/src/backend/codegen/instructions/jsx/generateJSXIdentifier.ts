import * as t from "@babel/types";
import { JSXIdentifierInstruction } from "../../../../ir/instructions/jsx/JSXIdentifier";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateJSXIdentifierInstruction(
  instruction: JSXIdentifierInstruction,
  generator: CodeGenerator,
): t.JSXIdentifier {
  const node = t.jsxIdentifier(instruction.name);
  generator.places.set(instruction.place.id, node);
  return node;
}
