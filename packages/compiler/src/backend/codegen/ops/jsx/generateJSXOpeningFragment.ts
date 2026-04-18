import * as t from "@babel/types";
import { JSXOpeningFragmentOp } from "../../../../ir/ops/jsx/JSXOpeningFragment";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateJSXOpeningFragmentOp(
  instruction: JSXOpeningFragmentOp,
  generator: CodeGenerator,
): t.JSXOpeningFragment {
  const node = t.jsxOpeningFragment();
  generator.values.set(instruction.place.id, node);
  return node;
}
