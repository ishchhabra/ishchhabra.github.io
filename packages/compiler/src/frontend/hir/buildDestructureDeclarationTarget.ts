import type * as AST from "../estree";
import type { Expression, PrivateIdentifier } from "oxc-parser";
import { Environment } from "../../environment";
import {
  type DestructureObjectProperty,
  type DestructureTarget,
} from "../../ir";
import { type Scope } from "../scope/Scope";
import { buildNode } from "./buildNode";
import { FunctionIRBuilder } from "./FunctionIRBuilder";
import { getValueFromStaticKey } from "./getValueFromStaticKey";
import { ModuleIRBuilder } from "./ModuleIRBuilder";

export function buildDestructureDeclarationTarget(
  node: AST.Pattern,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  kind: "var" | "let" | "const",
): DestructureTarget {
  switch (node.type) {
    case "Identifier":
      return buildDeclarationBindingTarget(node, scope, functionBuilder, environment, kind);
    case "ArrayPattern":
      return {
        kind: "array",
        elements: node.elements.map((element) =>
          element === null
            ? null
            : buildDestructureDeclarationTarget(
                element,
                scope,
                functionBuilder,
                moduleBuilder,
                environment,
                kind,
              ),
        ),
      };
    case "ObjectPattern":
      return {
        kind: "object",
        properties: node.properties.map((property) =>
          buildObjectDeclarationProperty(
            property,
            scope,
            functionBuilder,
            moduleBuilder,
            environment,
            kind,
          ),
        ),
      };
    case "AssignmentPattern":
      return {
        kind: "assignment",
        left: buildDestructureDeclarationTarget(
          node.left,
          scope,
          functionBuilder,
          moduleBuilder,
          environment,
          kind,
        ),
        right: buildRequiredPlace(
          node.right,
          scope,
          functionBuilder,
          moduleBuilder,
          environment,
          "Declaration pattern right must be a single place",
        ),
      };
    case "RestElement":
      return {
        kind: "rest",
        argument: buildDestructureDeclarationTarget(
          node.argument,
          scope,
          functionBuilder,
          moduleBuilder,
          environment,
          kind,
        ),
      };
  }

  throw new Error(`Unsupported declaration destructure target: ${(node as { type: string }).type}`);
}

function buildDeclarationBindingTarget(
  node: AST.Identifier,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  kind: "var" | "let" | "const",
): DestructureTarget {
  const declarationId = functionBuilder.getDeclarationId(node.name, scope);
  if (declarationId === undefined) {
    throw new Error(`Variable accessed before declaration: ${node.name}`);
  }

  const latestDeclaration = environment.getLatestDeclaration(declarationId);
  const place = environment.places.get(latestDeclaration.placeId);
  if (place === undefined) {
    throw new Error(`Unable to find the place for ${node.name} (${declarationId})`);
  }

  if (kind !== "var") {
    functionBuilder.markDeclarationInitialized(declarationId);
  }

  return {
    kind: "binding",
    place,
    storage: environment.contextDeclarationIds.has(declarationId) ? "context" : "local",
  };
}

function buildObjectDeclarationProperty(
  property: AST.Property | AST.RestElement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  kind: "var" | "let" | "const",
): DestructureObjectProperty {
  if (property.type === "RestElement") {
    return {
      key: "rest",
      computed: false,
      shorthand: false,
      value: {
        kind: "rest",
        argument: buildDestructureDeclarationTarget(
          property.argument,
          scope,
          functionBuilder,
          moduleBuilder,
          environment,
          kind,
        ),
      },
    };
  }

  return {
    key: property.computed
      ? buildComputedDeclarationPropertyKey(
          property.key,
          scope,
          functionBuilder,
          moduleBuilder,
          environment,
        )
      : buildStaticPropertyKey(property.key),
    computed: property.computed,
    shorthand: property.shorthand,
    value: buildDestructureDeclarationTarget(
      property.value as AST.Pattern,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
      kind,
    ),
  };
}

function buildStaticPropertyKey(
  node: Expression | PrivateIdentifier,
): string | number {
  const value = getValueFromStaticKey(node);
  if (value === undefined) {
    throw new Error("Unsupported static key type in object pattern destructuring");
  }

  return value;
}

function buildRequiredPlace(
  node: Expression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  message: string,
) {
  const place = buildNode(node, scope, functionBuilder, moduleBuilder, environment);
  if (place === undefined || Array.isArray(place)) {
    throw new Error(message);
  }
  return place;
}

function buildComputedDeclarationPropertyKey(
  node: AST.Property["key"],
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  if (node.type === "PrivateIdentifier") {
    throw new Error("PrivateIdentifier is not supported in object pattern destructuring");
  }
  return buildRequiredPlace(
    node,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
    "Object pattern computed key must be a single place",
  );
}
