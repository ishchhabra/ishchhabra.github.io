import type { JSXClosingFragment } from "oxc-parser";
import { Environment } from "../../../environment";
import { JSXClosingFragmentOp, Place } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildJSXClosingFragment(
  _node: JSXClosingFragment,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(JSXClosingFragmentOp, place);
  functionBuilder.addOp(instruction);
  return place;
}
