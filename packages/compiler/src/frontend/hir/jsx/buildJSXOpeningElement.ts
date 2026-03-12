import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { LoadLocalInstruction, Place } from "../../../ir";
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
  const tag = getJSXTagName(nodePath.node.name);
  const selfClosing = nodePath.node.selfClosing;

  // Build attributes through buildNode (they may be JSXAttribute, JSXSpreadAttribute, etc.)
  const attributes = nodePath.get("attributes").map((attrPath) => {
    const place = buildNode(attrPath, functionBuilder, moduleBuilder, environment);
    if (place === undefined || Array.isArray(place)) {
      throw new Error("JSX attribute should be a single place");
    }
    return place;
  });

  // Resolve tagPlace for component tags (uppercase first letter).
  // Intrinsic elements (div, span, etc.) don't need a tagPlace.
  let tagPlace: Place | undefined;
  if (/^[A-Z]/.test(tag)) {
    const rootName = tag.split(".")[0];
    const declarationId = functionBuilder.getDeclarationId(rootName, nodePath);
    if (declarationId !== undefined) {
      const latestDeclaration = environment.getLatestDeclaration(declarationId);
      const declarationPlace = environment.places.get(latestDeclaration.placeId);
      if (declarationPlace !== undefined) {
        const identifier = environment.createIdentifier(declarationId);
        tagPlace = environment.createPlace(identifier);
        const instruction = environment.createInstruction(
          LoadLocalInstruction,
          tagPlace,
          nodePath,
          declarationPlace,
        );
        functionBuilder.addInstruction(instruction);
      }
    }
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    JSXOpeningElementInstruction,
    place,
    nodePath,
    tag,
    tagPlace,
    attributes,
    selfClosing,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}

function getJSXTagName(name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName): string {
  if (t.isJSXIdentifier(name)) {
    return name.name;
  }
  if (t.isJSXMemberExpression(name)) {
    return `${getJSXTagName(name.object)}.${name.property.name}`;
  }
  if (t.isJSXNamespacedName(name)) {
    return `${name.namespace.name}:${name.name.name}`;
  }
  throw new Error(`Unsupported JSX tag name type`);
}
