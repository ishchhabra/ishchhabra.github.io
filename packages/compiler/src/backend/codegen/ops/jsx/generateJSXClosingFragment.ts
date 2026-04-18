import * as t from "@babel/types";
import { JSXClosingFragmentOp } from "../../../../ir/ops/jsx/JSXClosingFragment";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateJSXClosingFragmentOp(
  instruction: JSXClosingFragmentOp,
  generator: CodeGenerator,
): t.JSXClosingFragment {
  const node = t.jsxClosingFragment();
  generator.values.set(instruction.place.id, node);
  return node;
}
