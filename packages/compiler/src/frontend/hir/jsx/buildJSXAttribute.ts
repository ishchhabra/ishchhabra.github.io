import type { JSXAttribute, JSXIdentifier, JSXNamespacedName } from "oxc-parser";
import { Environment } from "../../../environment";
import { JSXAttributeOp, Place } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildJSXAttribute(
  node: JSXAttribute,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const name = getJSXAttributeName(node.name);

  let value: Place | undefined;
  if (node.value != null) {
    const valuePlace = buildNode(node.value, scope, functionBuilder, moduleBuilder, environment);
    if (valuePlace === undefined || Array.isArray(valuePlace)) {
      throw new Error("JSX attribute value should be a single place");
    }
    value = valuePlace;
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(JSXAttributeOp, place, name, value);
  functionBuilder.addOp(instruction);
  return place;
}

function getJSXAttributeName(name: JSXIdentifier | JSXNamespacedName): string {
  if (name.type === "JSXIdentifier") {
    return name.name;
  }
  return `${name.namespace.name}:${name.name.name}`;
}
