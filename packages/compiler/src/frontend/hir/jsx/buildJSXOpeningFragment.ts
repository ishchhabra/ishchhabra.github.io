import type { JSXOpeningFragment } from "oxc-parser";
import { Environment } from "../../../environment";
import { JSXOpeningFragmentOp, Place } from "../../../ir";
import { FuncOpBuilder } from "../FuncOpBuilder";

export function buildJSXOpeningFragment(
  _node: JSXOpeningFragment,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): Place {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(JSXOpeningFragmentOp, place);
  functionBuilder.addOp(instruction);
  return place;
}
