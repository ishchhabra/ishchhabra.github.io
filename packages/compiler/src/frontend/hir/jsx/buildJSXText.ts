import type * as AST from "../../estree";
import { Environment } from "../../../environment";
import { JSXTextInstruction, Place } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildJSXText(
  node: AST.JSXText,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place | undefined {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(JSXTextInstruction, place, node.value);
  functionBuilder.addInstruction(instruction);
  return place;
}
