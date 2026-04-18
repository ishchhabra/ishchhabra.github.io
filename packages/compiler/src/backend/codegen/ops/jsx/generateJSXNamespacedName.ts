import * as t from "@babel/types";
import { JSXNamespacedNameOp } from "../../../../ir/ops/jsx/JSXNamespacedName";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateJSXNamespacedNameOp(
  instruction: JSXNamespacedNameOp,
  generator: CodeGenerator,
): t.JSXNamespacedName {
  const node = t.jsxNamespacedName(
    t.jsxIdentifier(instruction.namespace),
    t.jsxIdentifier(instruction.name),
  );
  generator.values.set(instruction.place.id, node);
  return node;
}
