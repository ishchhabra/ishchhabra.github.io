import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { JSXAttributeInstruction, Place } from "../../../ir";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildJSXAttribute(
  nodePath: NodePath<t.JSXAttribute>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const name = getJSXAttributeName(nodePath.node.name);

  let value: Place | undefined;
  const valuePath = nodePath.get("value");
  if (valuePath.hasNode()) {
    const valuePlace = buildNode(valuePath, functionBuilder, moduleBuilder, environment);
    if (valuePlace === undefined || Array.isArray(valuePlace)) {
      throw new Error("JSX attribute value should be a single place");
    }
    value = valuePlace;
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    JSXAttributeInstruction,
    place,
    name,
    value,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}

function getJSXAttributeName(name: t.JSXIdentifier | t.JSXNamespacedName): string {
  if (t.isJSXIdentifier(name)) {
    return name.name;
  }
  return `${name.namespace.name}:${name.name.name}`;
}
