import type * as JSX from "estree-jsx";
import { Environment } from "../../../environment";
import { JSXClosingFragmentInstruction, Place } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildJSXClosingFragment(
  _node: JSX.JSXClosingFragment,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(JSXClosingFragmentInstruction, place);
  functionBuilder.addInstruction(instruction);
  return place;
}
