import type { JSXOpeningElement } from "oxc-parser";
import { Environment } from "../../../environment";
import { Value } from "../../../ir";
import { JSXOpeningElementOp } from "../../../ir/ops/jsx/JSXOpeningElement";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildNode } from "../buildNode";

export function buildJSXOpeningElement(
  node: JSXOpeningElement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value {
  const selfClosing = node.selfClosing;

  // Build attributes through buildNode (they may be JSXAttribute, JSXSpreadAttribute, etc.)
  const attributes = node.attributes.map((attr) => {
    const place = buildNode(attr, scope, functionBuilder, moduleBuilder, environment);
    if (place === undefined || Array.isArray(place)) {
      throw new Error("JSX attribute should be a single place");
    }
    return place;
  });

  const tagPlace = buildNode(node.name, scope, functionBuilder, moduleBuilder, environment);
  if (tagPlace === undefined || Array.isArray(tagPlace)) {
    throw new Error("JSX tag name should be a single place");
  }

  const place = environment.createValue();
  const instruction = environment.createOperation(
    JSXOpeningElementOp,
    place,
    tagPlace,
    attributes,
    selfClosing,
  );
  functionBuilder.addOp(instruction);
  return place;
}
