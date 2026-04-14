import type { JSXClosingFragment } from "oxc-parser";
import { Environment } from "../../../environment";
import { JSXClosingFragmentOp, Place } from "../../../ir";
import { FuncOpBuilder } from "../FuncOpBuilder";

export function buildJSXClosingFragment(
  _node: JSXClosingFragment,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): Place {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(JSXClosingFragmentOp, place);
  functionBuilder.addOp(instruction);
  return place;
}
