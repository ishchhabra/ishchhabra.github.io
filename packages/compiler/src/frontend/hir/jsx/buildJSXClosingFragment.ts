import type { JSXClosingFragment } from "oxc-parser";
import { Environment } from "../../../environment";
import { JSXClosingFragmentOp, Value } from "../../../ir";
import { FuncOpBuilder } from "../FuncOpBuilder";

export function buildJSXClosingFragment(
  _node: JSXClosingFragment,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): Value {
  const place = environment.createValue();
  const instruction = environment.createOperation(JSXClosingFragmentOp, place);
  functionBuilder.addOp(instruction);
  return place;
}
