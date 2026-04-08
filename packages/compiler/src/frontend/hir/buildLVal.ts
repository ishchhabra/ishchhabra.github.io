import type * as AST from "../estree";
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
import { type Scope } from "../scope/Scope";
import { buildNode } from "./buildNode";
import { FunctionIRBuilder } from "./FunctionIRBuilder";
import { getValueFromStaticKey } from "./getValueFromStaticKey";
import { ModuleIRBuilder } from "./ModuleIRBuilder";

/**
 * Builds an lval, emitting DeclareLocal at the leaf for let/const declarations.
 *
 * @returns place -- the top-level Place representing this lval
 * @returns bindings -- all leaf identifier Places (for pattern instruction getDefs)
 */
export function buildLVal(
  node: AST.Pattern,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  kind: "var" | "let" | "const" | null,
): { place: Place; bindings: Place[] } {
  if (node.type === "Identifier") {
    const place = buildIdentifierLVal(node, scope, functionBuilder, environment, kind);
    return { place, bindings: [place] };
  } else if (node.type === "ArrayPattern") {
    return buildArrayPatternLVal(node, scope, functionBuilder, moduleBuilder, environment, kind);
  } else if (node.type === "ObjectPattern") {
    return buildObjectPatternLVal(node, scope, functionBuilder, moduleBuilder, environment, kind);
  } else if (node.type === "AssignmentPattern") {
    return buildAssignmentPatternLVal(
      node,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
      kind,
    );
  } else if (node.type === "RestElement") {
    return buildRestElementLVal(node, scope, functionBuilder, moduleBuilder, environment, kind);
  }

  throw new Error(`Unsupported LVal type: ${node.type}`);
}

function buildIdentifierLVal(
  node: AST.Identifier,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  kind: "var" | "let" | "const" | null,
): Place {
  const name = node.name;
  const declarationId = functionBuilder.getDeclarationId(name, scope);
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
  node: AST.ArrayPattern,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  kind: "var" | "let" | "const" | null,
): { place: Place; bindings: Place[] } {
  const bindings: Place[] = [];

  const elementPlaces = node.elements.map((element) => {
    if (element == null) {
      return null;
    }

    const result = buildLVal(element, scope, functionBuilder, moduleBuilder, environment, kind);
    bindings.push(...result.bindings);
    return result.place;
  });

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
  node: AST.ObjectPattern,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  kind: "var" | "let" | "const" | null,
): { place: Place; bindings: Place[] } {
  const bindings: Place[] = [];

  const propertyPlaces = node.properties.map((property) => {
    if (property.type === "RestElement") {
      const result = buildRestElementLVal(
        property,
        scope,
        functionBuilder,
        moduleBuilder,
        environment,
        kind,
      );
      bindings.push(...result.bindings);
      return result.place;
    }

    // ESTree Property (was Babel ObjectProperty)
    let keyPlace;
    if (property.computed) {
      const place = buildNode(property.key, scope, functionBuilder, moduleBuilder, environment);
      if (place === undefined || Array.isArray(place)) {
        throw new Error("Object pattern computed key must be a single place");
      }
      keyPlace = place;
    } else {
      keyPlace = buildObjectPropertyStaticKeyLVal(property.key, functionBuilder, environment);
    }

    const value = property.value as AST.Pattern;
    const result = buildLVal(value, scope, functionBuilder, moduleBuilder, environment, kind);
    bindings.push(...result.bindings);

    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    const instruction = environment.createInstruction(
      ObjectPropertyInstruction,
      place,
      keyPlace,
      result.place,
      property.computed,
      false,
      result.bindings,
    );
    functionBuilder.addInstruction(instruction);
    return place;
  });

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
  node: AST.Expression | AST.PrivateIdentifier,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const value = getValueFromStaticKey(node);
  if (value === undefined) {
    throw new Error("Unsupported static key type in object pattern destructuring");
  }
  const keyIdentifier = environment.createIdentifier();
  const keyPlace = environment.createPlace(keyIdentifier);
  const keyInstruction = environment.createInstruction(LiteralInstruction, keyPlace, value);
  functionBuilder.addInstruction(keyInstruction);
  return keyPlace;
}

function buildAssignmentPatternLVal(
  node: AST.AssignmentPattern,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  kind: "var" | "let" | "const" | null,
): { place: Place; bindings: Place[] } {
  const rightPlace = buildNode(node.right, scope, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("Right place must be a single place");
  }

  const result = buildLVal(node.left, scope, functionBuilder, moduleBuilder, environment, kind);

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
  node: AST.RestElement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  kind: "var" | "let" | "const" | null,
): { place: Place; bindings: Place[] } {
  const result = buildLVal(node.argument, scope, functionBuilder, moduleBuilder, environment, kind);

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
