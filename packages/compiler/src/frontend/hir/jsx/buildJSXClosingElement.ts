import type { JSXClosingElement } from "oxc-parser";
import { Environment } from "../../../environment";
import { JSXClosingElementOp, Value } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildJSXClosingElement(
  node: JSXClosingElement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value {
  const tagPlace = buildNode(node.name, scope, functionBuilder, moduleBuilder, environment);
  if (tagPlace === undefined || Array.isArray(tagPlace)) {
    throw new Error("JSX closing element tag name should be a single place");
  }

  const place = environment.createValue();
  const instruction = environment.createOperation(JSXClosingElementOp, place, tagPlace);
  functionBuilder.addOp(instruction);
  return place;
}
