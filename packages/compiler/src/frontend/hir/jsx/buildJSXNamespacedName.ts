import type { JSXNamespacedName } from "oxc-parser";
import { Environment } from "../../../environment";
import { JSXNamespacedNameOp, Place } from "../../../ir";
import { FuncOpBuilder } from "../FuncOpBuilder";

export function buildJSXNamespacedName(
  node: JSXNamespacedName,
  functionBuilder: FuncOpBuilder,
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
