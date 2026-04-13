import type { JSXText } from "oxc-parser";
import { Environment } from "../../../environment";
import { JSXTextOp, Place } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildJSXText(
  node: JSXText,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place | undefined {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(JSXTextOp, place, node.value);
  functionBuilder.addOp(instruction);
  return place;
}
