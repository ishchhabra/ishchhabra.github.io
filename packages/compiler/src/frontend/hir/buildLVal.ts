import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../environment";
import {
  ArrayPatternInstruction,
  AssignmentPatternInstruction,
  DeclareLocalInstruction,
  LiteralInstruction,
  ObjectPatternInstruction,
  ObjectPropertyInstruction,
  Place,
  RestElementInstruction,
} from "../../ir";
import { buildNode } from "./buildNode";
import { FunctionIRBuilder } from "./FunctionIRBuilder";
import { getValueFromStaticKey } from "./getValueFromStaticKey";
import { ModuleIRBuilder } from "./ModuleIRBuilder";

/**
 * Builds an lval, emitting DeclareLocal at the leaf for let/const declarations.
 *
 * @returns place — the top-level Place representing this lval
 * @returns bindings — all leaf identifier Places (for pattern instruction getWrittenPlaces)
 */
export function buildLVal(
  nodePath: NodePath<t.LVal>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  kind: "var" | "let" | "const" | null,
): { place: Place; bindings: Place[] } {
  if (nodePath.isIdentifier()) {
    const place = buildIdentifierLVal(nodePath, functionBuilder, environment, kind);
    return { place, bindings: [place] };
  } else if (nodePath.isArrayPattern()) {
    return buildArrayPatternLVal(nodePath, functionBuilder, moduleBuilder, environment, kind);
  } else if (nodePath.isObjectPattern()) {
    return buildObjectPatternLVal(nodePath, functionBuilder, moduleBuilder, environment, kind);
  } else if (nodePath.isAssignmentPattern()) {
    return buildAssignmentPatternLVal(nodePath, functionBuilder, moduleBuilder, environment, kind);
  } else if (nodePath.isRestElement()) {
    return buildRestElementLVal(nodePath, functionBuilder, moduleBuilder, environment, kind);
  }

  throw new Error(`Unsupported LVal type: ${nodePath.type}`);
}

function buildIdentifierLVal(
  nodePath: NodePath<t.Identifier>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  kind: "var" | "let" | "const" | null,
): Place {
  const name = nodePath.node.name;
  const declarationId = functionBuilder.getDeclarationId(name, nodePath);
  if (declarationId === undefined) {
    throw new Error(`Variable accessed before declaration: ${name}`);
  }

  const latestDeclaration = environment.getLatestDeclaration(declarationId);
  const place = environment.places.get(latestDeclaration.placeId);
  if (place === undefined) {
    throw new Error(`Unable to find the place for ${name} (${declarationId})`);
  }
  place.identifier.name = name;

  if (kind !== null && kind !== "var") {
    functionBuilder.addInstruction(
      environment.createInstruction(DeclareLocalInstruction, place, kind),
    );
    functionBuilder.markDeclarationInitialized(declarationId);
  }

  return place;
}

function buildArrayPatternLVal(
  nodePath: NodePath<t.ArrayPattern>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  kind: "var" | "let" | "const" | null,
): { place: Place; bindings: Place[] } {
  const bindings: Place[] = [];

  const elementPaths = nodePath.get("elements");
  const elementPlaces = elementPaths.map(
    (elementPath: NodePath<t.ArrayPattern["elements"][number]>) => {
      if (!elementPath.hasNode()) {
        return null;
      }

      elementPath.assertLVal();
      const result = buildLVal(elementPath, functionBuilder, moduleBuilder, environment, kind);
      bindings.push(...result.bindings);
      return result.place;
    },
  );

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ArrayPatternInstruction,
    place,
    elementPlaces,
    bindings,
  );
  functionBuilder.addInstruction(instruction);
  return { place, bindings };
}

function buildObjectPatternLVal(
  nodePath: NodePath<t.ObjectPattern>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  kind: "var" | "let" | "const" | null,
): { place: Place; bindings: Place[] } {
  const bindings: Place[] = [];

  const propertyPaths = nodePath.get("properties");
  const propertyPlaces = propertyPaths.map(
    (propertyPath: NodePath<t.ObjectPattern["properties"][number]>) => {
      if (propertyPath.isRestElement()) {
        const result = buildRestElementLVal(
          propertyPath,
          functionBuilder,
          moduleBuilder,
          environment,
          kind,
        );
        bindings.push(...result.bindings);
        return result.place;
      }

      propertyPath.assertObjectProperty();
      const keyPath = propertyPath.get("key");
      let keyPlace;
      if (propertyPath.node.computed) {
        const place = buildNode(keyPath, functionBuilder, moduleBuilder, environment);
        if (place === undefined || Array.isArray(place)) {
          throw new Error("Object pattern computed key must be a single place");
        }
        keyPlace = place;
      } else {
        keyPlace = buildObjectPropertyStaticKeyLVal(keyPath, functionBuilder, environment);
      }

      const valuePath: NodePath<t.ObjectProperty["value"]> = propertyPath.get("value");
      valuePath.assertLVal();
      const result = buildLVal(valuePath, functionBuilder, moduleBuilder, environment, kind);
      bindings.push(...result.bindings);

      const identifier = environment.createIdentifier();
      const place = environment.createPlace(identifier);
      const instruction = environment.createInstruction(
        ObjectPropertyInstruction,
        place,
        keyPlace,
        result.place,
        propertyPath.node.computed,
        false,
        result.bindings,
      );
      functionBuilder.addInstruction(instruction);
      return place;
    },
  );

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    ObjectPatternInstruction,
    place,
    propertyPlaces,
    bindings,
  );
  functionBuilder.addInstruction(instruction);
  return { place, bindings };
}

function buildObjectPropertyStaticKeyLVal(
  nodePath: NodePath<t.ObjectProperty["key"]>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const value = getValueFromStaticKey(nodePath);
  if (value === undefined) {
    throw new Error("Unsupported static key type in object pattern destructuring");
  }
  const keyIdentifier = environment.createIdentifier();
  const keyPlace = environment.createPlace(keyIdentifier);
  const keyInstruction = environment.createInstruction(
    LiteralInstruction,
    keyPlace,
    value,
  );
  functionBuilder.addInstruction(keyInstruction);
  return keyPlace;
}

function buildAssignmentPatternLVal(
  nodePath: NodePath<t.AssignmentPattern>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  kind: "var" | "let" | "const" | null,
): { place: Place; bindings: Place[] } {
  const rightPath = nodePath.get("right");
  const rightPlace = buildNode(rightPath, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Right place must be a single place");
  }

  const result = buildLVal(nodePath.get("left"), functionBuilder, moduleBuilder, environment, kind);

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    AssignmentPatternInstruction,
    place,
    result.place,
    rightPlace,
    result.bindings,
  );
  functionBuilder.addInstruction(instruction);
  return { place, bindings: result.bindings };
}

function buildRestElementLVal(
  nodePath: NodePath<t.RestElement>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  kind: "var" | "let" | "const" | null,
): { place: Place; bindings: Place[] } {
  const result = buildLVal(
    nodePath.get("argument"),
    functionBuilder,
    moduleBuilder,
    environment,
    kind,
  );

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    RestElementInstruction,
    place,
    result.place,
    result.bindings,
  );
  functionBuilder.addInstruction(instruction);
  return { place, bindings: result.bindings };
}
