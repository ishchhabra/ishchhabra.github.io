import * as t from "@babel/types";
import { JSXClosingFragmentInstruction } from "../../../../ir/instructions/jsx/JSXClosingFragment";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateJSXClosingFragmentInstruction(
  instruction: JSXClosingFragmentInstruction,
  generator: CodeGenerator,
): t.JSXClosingFragment {
  const node = t.jsxClosingFragment();
  generator.places.set(instruction.place.id, node);
  return node;
}
