import type { JSXElement } from "oxc-parser";
import { Environment } from "../../../environment";
import { JSXElementOp, Place } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildNode } from "../buildNode";
import { buildJSXOpeningElement } from "./buildJSXOpeningElement";

export function buildJSXElement(
  node: JSXElement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place | undefined {
  const openingElement = buildJSXOpeningElement(
    node.openingElement,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
  );

  let closingElement;
  if (node.closingElement != null) {
    closingElement = buildNode(
      node.closingElement,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }
  if (Array.isArray(closingElement)) {
    throw new Error("JSXElement closing element should be a single place");
  }

  const childrenPlaces: Place[] = [];
  for (const child of node.children) {
    const place = buildNode(child as any, scope, functionBuilder, moduleBuilder, environment);
    // JSXEmptyExpression (`{}`, `{/* ... */}`) yields no value and no IR child.
    if (place === undefined) {
      continue;
    }
    if (Array.isArray(place)) {
      throw new Error("JSXElement child should be a single place");
    }
    childrenPlaces.push(place);
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(
    JSXElementOp,
    place,
    openingElement,
    closingElement,
    childrenPlaces,
  );
  functionBuilder.addOp(instruction);
  return place;
}
