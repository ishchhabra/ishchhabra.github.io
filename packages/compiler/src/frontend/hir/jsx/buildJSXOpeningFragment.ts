import type * as JSX from "estree-jsx";
import { Environment } from "../../../environment";
import { JSXOpeningFragmentInstruction, Place } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildJSXOpeningFragment(
  _node: JSX.JSXOpeningFragment,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const identifier = environment.createIdentifier(undefined, functionBuilder.scope.allocateName());
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(JSXOpeningFragmentInstruction, place);
  functionBuilder.addInstruction(instruction);
  return place;
}
