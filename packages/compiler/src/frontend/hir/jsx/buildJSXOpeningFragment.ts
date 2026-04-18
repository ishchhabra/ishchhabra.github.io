import type { JSXOpeningFragment } from "oxc-parser";
import { Environment } from "../../../environment";
import { JSXOpeningFragmentOp, Value } from "../../../ir";
import { FuncOpBuilder } from "../FuncOpBuilder";

export function buildJSXOpeningFragment(
  _node: JSXOpeningFragment,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): Value {
  const place = environment.createValue();
  const instruction = environment.createOperation(JSXOpeningFragmentOp, place);
  functionBuilder.addOp(instruction);
  return place;
}
