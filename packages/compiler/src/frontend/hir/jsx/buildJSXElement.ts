import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { JSXElementInstruction, Place } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildNode } from "../buildNode";
import { buildJSXOpeningElement } from "./buildJSXOpeningElement";

export function buildJSXElement(
  nodePath: NodePath<t.JSXElement>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place | undefined {
  const openingElementPath = nodePath.get("openingElement");
  const openingElement = buildJSXOpeningElement(
    openingElementPath,
    functionBuilder,
    moduleBuilder,
    environment,
  );

  let closingElement;
  const closingElementPath = nodePath.get("closingElement");
  if (closingElementPath.hasNode()) {
    closingElement = buildNode(closingElementPath, functionBuilder, moduleBuilder, environment);
  }
  if (Array.isArray(closingElement)) {
    throw new Error("JSXElement closing element should be a single place");
  }

  const children = nodePath.get("children");
  const childrenPlaces: Place[] = [];
  for (const child of children) {
    const place = buildNode(child, functionBuilder, moduleBuilder, environment);
    // JSXEmptyExpression (`{}`, `{/* … */}`) yields no value and no IR child.
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
  const instruction = environment.createInstruction(
    JSXElementInstruction,
    place,
    openingElement,
    closingElement,
    childrenPlaces,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
