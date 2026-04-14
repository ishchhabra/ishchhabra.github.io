import type { Expression, MemberExpression, PrivateIdentifier } from "oxc-parser";
import { Environment } from "../../environment";
import { type DestructureObjectProperty, type DestructureTarget, Place } from "../../ir";
import type * as AST from "../estree";
import { type Scope } from "../scope/Scope";
import { buildMemberReference } from "./expressions/buildMemberReference";
import { buildNode } from "./buildNode";
import { FuncOpBuilder } from "./FuncOpBuilder";
import { getValueFromStaticKey } from "./getValueFromStaticKey";
import { ModuleIRBuilder } from "./ModuleIRBuilder";

export type LValMode =
  | { kind: "declaration"; declarationKind: "var" | "let" | "const" }
  | { kind: "assignment" };

export function buildLVal(
  node: AST.Pattern | MemberExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  mode: LValMode,
): DestructureTarget {
  switch (node.type) {
    case "Identifier":
      return buildIdentifierLVal(node, scope, functionBuilder, environment, mode);
    case "MemberExpression":
      if (mode.kind === "declaration") {
        throw new Error("Member expressions are not valid declaration targets");
      }
      return buildMemberExpressionLVal(node, scope, functionBuilder, moduleBuilder, environment);
    case "ArrayPattern":
      return {
        kind: "array",
        elements: node.elements.map((element) =>
          element === null
            ? null
            : buildLVal(
                element as AST.Pattern | MemberExpression,
                scope,
                functionBuilder,
                moduleBuilder,
                environment,
                mode,
              ),
        ),
      };
    case "ObjectPattern":
      return {
        kind: "object",
        properties: node.properties.map((property) =>
          buildObjectPropertyLVal(
            property,
            scope,
            functionBuilder,
            moduleBuilder,
            environment,
            mode,
          ),
        ),
      };
    case "AssignmentPattern":
      return {
        kind: "assignment",
        left: buildLVal(node.left, scope, functionBuilder, moduleBuilder, environment, mode),
        right: buildRequiredPlace(
          node.right,
          scope,
          functionBuilder,
          moduleBuilder,
          environment,
          mode.kind === "declaration"
            ? "Declaration pattern right must be a single place"
            : "Assignment pattern right must be a single place",
        ),
      };
    case "RestElement":
      return {
        kind: "rest",
        argument: buildLVal(
          node.argument as AST.Pattern | MemberExpression,
          scope,
          functionBuilder,
          moduleBuilder,
          environment,
          mode,
        ),
      };
  }

  throw new Error(`Unsupported LVal type: ${(node as { type: string }).type}`);
}

function buildIdentifierLVal(
  node: AST.Identifier,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
  mode: LValMode,
): DestructureTarget {
  const name = node.name;
  const declarationId = functionBuilder.getDeclarationId(name, scope);
  if (declarationId === undefined) {
    throw new Error(`Variable accessed before declaration: ${name}`);
  }

  if (mode.kind === "assignment") {
    if (environment.contextDeclarationIds.has(declarationId)) {
      if (!functionBuilder.isOwnDeclaration(declarationId)) {
        const declarationPlace = environment.getDeclarationBinding(declarationId);
        if (declarationPlace === undefined) {
          throw new Error(`Unable to find the binding place for ${name} (${declarationId})`);
        }
        functionBuilder.captures.set(declarationId, declarationPlace);
        if (!functionBuilder.captureParams.has(declarationId)) {
          const paramIdentifier = environment.createIdentifier(declarationId);
          functionBuilder.captureParams.set(
            declarationId,
            environment.createPlace(paramIdentifier),
          );
        }
        return {
          kind: "binding",
          place: functionBuilder.captureParams.get(declarationId)!,
          storage: "context",
        };
      }

      const bindingPlace = environment.getDeclarationBinding(declarationId);
      const place =
        bindingPlace ??
        environment.places.get(environment.getLatestDeclaration(declarationId)!.placeId);
      if (place === undefined) {
        throw new Error(`Unable to find the place for ${name} (${declarationId})`);
      }
      return { kind: "binding", place, storage: "context" };
    }

    const bindingPlace = environment.getDeclarationBinding(declarationId);
    if (bindingPlace === undefined) {
      throw new Error(`Unable to find the binding for ${name} (${declarationId})`);
    }
    environment.registerDeclaration(
      declarationId,
      functionBuilder.currentBlock.id,
      bindingPlace.id,
    );
    return { kind: "binding", place: bindingPlace, storage: "local" };
  }

  const latestDeclaration = environment.getLatestDeclaration(declarationId);
  const place = environment.places.get(latestDeclaration.placeId);
  if (place === undefined) {
    throw new Error(`Unable to find the place for ${name} (${declarationId})`);
  }
  if (mode.declarationKind !== "var") {
    functionBuilder.markDeclarationInitialized(declarationId);
  }

  return {
    kind: "binding",
    place,
    storage: environment.contextDeclarationIds.has(declarationId) ? "context" : "local",
  };
}

function buildMemberExpressionLVal(
  node: MemberExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): DestructureTarget {
  const reference = buildMemberReference(node, scope, functionBuilder, moduleBuilder, environment);
  return reference.kind === "static"
    ? {
        kind: "static-member",
        object: reference.object,
        property: reference.property,
        optional: reference.optional,
      }
    : {
        kind: "dynamic-member",
        object: reference.object,
        property: reference.property,
        optional: reference.optional,
      };
}

function buildObjectPropertyLVal(
  property: AST.Property | AST.RestElement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  mode: LValMode,
): DestructureObjectProperty {
  if (property.type === "RestElement") {
    return {
      key: "rest",
      computed: false,
      shorthand: false,
      value: {
        kind: "rest",
        argument: buildLVal(
          property.argument as AST.Pattern | MemberExpression,
          scope,
          functionBuilder,
          moduleBuilder,
          environment,
          mode,
        ),
      },
    };
  }

  return {
    key: property.computed
      ? buildComputedPropertyKey(property.key, scope, functionBuilder, moduleBuilder, environment)
      : buildStaticPropertyKey(property.key),
    computed: property.computed,
    shorthand: property.shorthand,
    value: buildLVal(
      property.value as AST.Pattern | MemberExpression,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
      mode,
    ),
  };
}

function buildStaticPropertyKey(node: Expression | PrivateIdentifier): string | number {
  const value = getValueFromStaticKey(node);
  if (value === undefined) {
    throw new Error("Unsupported static key type in object pattern destructuring");
  }
  return value;
}

function buildComputedPropertyKey(
  node: AST.Property["key"],
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
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

function buildRequiredPlace(
  node: Expression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  message: string,
): Place {
  const place = buildNode(node, scope, functionBuilder, moduleBuilder, environment);
  if (place === undefined || Array.isArray(place)) {
    throw new Error(message);
  }
  return place;
}
