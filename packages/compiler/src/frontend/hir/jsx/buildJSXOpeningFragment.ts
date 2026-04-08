import type * as AST from "../../estree";
import { Environment } from "../../../environment";
import { JSXOpeningFragmentInstruction, Place } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildJSXOpeningFragment(
  _node: AST.JSXOpeningFragment,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(JSXOpeningFragmentInstruction, place);
  functionBuilder.addInstruction(instruction);
  return place;
}
