import type * as JSX from "estree-jsx";
import { Environment } from "../../../environment";
import { JSXAttributeInstruction, Place } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildJSXAttribute(
  node: JSX.JSXAttribute,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
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
  const instruction = environment.createInstruction(JSXAttributeInstruction, place, name, value);
  functionBuilder.addInstruction(instruction);
  return place;
}

function getJSXAttributeName(name: JSX.JSXIdentifier | JSX.JSXNamespacedName): string {
  if (name.type === "JSXIdentifier") {
    return name.name;
  }
  return `${name.namespace.name}:${name.name.name}`;
}
