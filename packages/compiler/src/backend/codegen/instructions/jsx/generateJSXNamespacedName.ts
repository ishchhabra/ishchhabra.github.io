import * as t from "@babel/types";
import { JSXNamespacedNameInstruction } from "../../../../ir/instructions/jsx/JSXNamespacedName";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateJSXNamespacedNameInstruction(
  instruction: JSXNamespacedNameInstruction,
  generator: CodeGenerator,
): t.JSXNamespacedName {
  const node = t.jsxNamespacedName(
    t.jsxIdentifier(instruction.namespace),
    t.jsxIdentifier(instruction.name),
  );
  generator.places.set(instruction.place.id, node);
  return node;
}
