import type * as JSX from "estree-jsx";
import { Environment } from "../../../environment";
import { JSXNamespacedNameInstruction, Place } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildJSXNamespacedName(
  node: JSX.JSXNamespacedName,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    JSXNamespacedNameInstruction,
    place,
    node.namespace.name,
    node.name.name,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
