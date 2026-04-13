import * as t from "@babel/types";
import { JSXTextOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateJSXTextOp(instruction: JSXTextOp, generator: CodeGenerator) {
  const node = t.jsxText(instruction.value);
  generator.places.set(instruction.place.id, node);
  return node;
}
