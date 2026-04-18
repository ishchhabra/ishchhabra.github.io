import type { JSXNamespacedName } from "oxc-parser";
import { Environment } from "../../../environment";
import { JSXNamespacedNameOp, Value } from "../../../ir";
import { FuncOpBuilder } from "../FuncOpBuilder";

export function buildJSXNamespacedName(
  node: JSXNamespacedName,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): Value {
  const place = environment.createValue();
  const instruction = environment.createOperation(
    JSXNamespacedNameOp,
    place,
    node.namespace.name,
    node.name.name,
  );
  functionBuilder.addOp(instruction);
  return place;
}
