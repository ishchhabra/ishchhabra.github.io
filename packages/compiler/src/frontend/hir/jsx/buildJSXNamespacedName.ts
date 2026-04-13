import type { JSXNamespacedName } from "oxc-parser";
import { Environment } from "../../../environment";
import { JSXNamespacedNameOp, Place } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildJSXNamespacedName(
  node: JSXNamespacedName,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(
    JSXNamespacedNameOp,
    place,
    node.namespace.name,
    node.name.name,
  );
  functionBuilder.addOp(instruction);
  return place;
}
