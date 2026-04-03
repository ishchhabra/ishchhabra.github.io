import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { Place } from "../../../ir";
import { JSXOpeningElementInstruction } from "../../../ir/instructions/jsx/JSXOpeningElement";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildNode } from "../buildNode";

export function buildJSXOpeningElement(
  nodePath: NodePath<t.JSXOpeningElement>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const selfClosing = nodePath.node.selfClosing;

  // Build attributes through buildNode (they may be JSXAttribute, JSXSpreadAttribute, etc.)
  const attributes = nodePath.get("attributes").map((attrPath) => {
    const place = buildNode(attrPath, functionBuilder, moduleBuilder, environment);
    if (place === undefined || Array.isArray(place)) {
      throw new Error("JSX attribute should be a single place");
    }
    return place;
  });

  const tagPlace = buildNode(nodePath.get("name"), functionBuilder, moduleBuilder, environment);
  if (tagPlace === undefined || Array.isArray(tagPlace)) {
    throw new Error("JSX tag name should be a single place");
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    JSXOpeningElementInstruction,
    place,
    tagPlace,
    attributes,
    selfClosing,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}
