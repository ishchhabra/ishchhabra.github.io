import type { JSXOpeningElement } from "oxc-parser";
import { Environment } from "../../../environment";
import { Place } from "../../../ir";
import { JSXOpeningElementOp } from "../../../ir/ops/jsx/JSXOpeningElement";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildNode } from "../buildNode";

export function buildJSXOpeningElement(
  node: JSXOpeningElement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
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

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
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
