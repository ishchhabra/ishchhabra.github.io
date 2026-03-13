import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { JSXClosingFragmentInstruction, Place } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildJSXClosingFragment(
  nodePath: NodePath<t.JSXClosingFragment>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    JSXClosingFragmentInstruction,
    place,
    nodePath,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
