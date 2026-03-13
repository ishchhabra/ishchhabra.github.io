import * as t from "@babel/types";
import { JSXOpeningFragmentInstruction } from "../../../../ir/instructions/jsx/JSXOpeningFragment";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateJSXOpeningFragmentInstruction(
  instruction: JSXOpeningFragmentInstruction,
  generator: CodeGenerator,
): t.JSXOpeningFragment {
  const node = t.jsxOpeningFragment();
  generator.places.set(instruction.place.id, node);
  return node;
}
