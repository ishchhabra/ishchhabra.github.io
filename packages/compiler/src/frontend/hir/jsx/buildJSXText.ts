import type { JSXText } from "oxc-parser";
import { Environment } from "../../../environment";
import { JSXTextOp, Value } from "../../../ir";
import { FuncOpBuilder } from "../FuncOpBuilder";

export function buildJSXText(
  node: JSXText,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): Value | undefined {
  const place = environment.createValue();
  const instruction = environment.createOperation(JSXTextOp, place, node.value);
  functionBuilder.addOp(instruction);
  return place;
}
