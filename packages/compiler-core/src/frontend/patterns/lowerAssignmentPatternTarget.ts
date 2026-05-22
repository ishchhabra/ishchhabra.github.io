import type {
  AssignmentTarget,
  AssignmentTargetMaybeDefault,
  AssignmentTargetRest,
  Expression,
  PrivateIdentifier,
  PropertyKey as OxcPropertyKey,
} from "oxc-parser";

import type {
  AssignmentPatternTarget,
  PatternExpression,
  PatternPropertyKey,
} from "../../ir/core/DestructurePattern";
import { lowerExpression } from "../expressions/lowerExpression";
import { lowerMemberReference } from "../expressions/lowerMemberExpression";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerDeferredExpression } from "../functions/lowerDeferredExpression";

/**
 * Converts an ECMAScript assignment pattern into compiler-owned IR pattern data.
 */
export function lowerAssignmentPatternTarget(
  builder: FunctionIRBuilder,
  target: AssignmentTarget | AssignmentTargetMaybeDefault | AssignmentTargetRest,
): AssignmentPatternTarget {
  switch (target.type) {
    case "Identifier": {
      const declaration = builder.declarationForReference(target);
      return {
        kind: "binding",
        declarationId: declaration.id,
      };
    }

    case "MemberExpression": {
      const reference = lowerMemberReference(builder, target);
      if (reference.key.kind === "static") {
        return {
          kind: "static-property",
          object: reference.object,
          key: reference.key.name,
        };
      }

      return {
        kind: "dynamic-property",
        object: reference.object,
        key: reference.key.value,
      };
    }

    case "ArrayPattern":
      return {
        kind: "array",
        elements: target.elements.map((element) =>
          element === null ? null : lowerAssignmentPatternTarget(builder, element),
        ),
      };

    case "ObjectPattern":
      return {
        kind: "object",
        properties: target.properties.map((property) => {
          if (property.type === "RestElement") {
            return {
              kind: "rest",
              target: lowerAssignmentPatternTarget(builder, property.argument),
            };
          }

          return {
            kind: "property",
            key: lowerObjectPatternKey(builder, property.key, property.computed),
            target: lowerAssignmentPatternTarget(builder, property.value),
          };
        }),
      };

    case "AssignmentPattern": {
      return {
        kind: "default",
        target: lowerAssignmentPatternTarget(builder, target.left),
        expression: lowerPatternExpression(builder, target.right),
      };
    }

    case "RestElement":
      return {
        kind: "rest",
        target: lowerAssignmentPatternTarget(builder, target.argument),
      };

    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
    case "TSTypeAssertion":
      return lowerAssignmentPatternTarget(builder, target.expression as AssignmentTarget);
  }
}

function lowerObjectPatternKey(
  builder: FunctionIRBuilder,
  key: OxcPropertyKey,
  computed: boolean,
): PatternPropertyKey {
  if (computed) {
    return {
      kind: "computed",
      expression: lowerPatternExpression(builder, expressionPropertyKey(key)),
    };
  }

  if (key.type === "PrivateIdentifier") {
    throw new Error("Private names are not valid object assignment pattern keys");
  }

  switch (key.type) {
    case "Identifier":
      return { kind: "static", name: key.name };

    case "Literal":
      if (
        typeof key.value !== "string" &&
        typeof key.value !== "number" &&
        typeof key.value !== "bigint"
      ) {
        throw new Error(`Unsupported object assignment pattern literal key: ${String(key.value)}`);
      }

      return { kind: "static", name: String(key.value) };

    default:
      throw new Error(`Unsupported object assignment pattern key: ${key.type}`);
  }
}

function lowerPatternExpression(
  builder: FunctionIRBuilder,
  expression: Expression,
): PatternExpression {
  return {
    kind: "deferred",
    functionIR: lowerDeferredExpression(builder, expression, "pattern-expression"),
  };
}

function expressionPropertyKey(
  key: OxcPropertyKey,
): Exclude<OxcPropertyKey, PrivateIdentifier> & Expression {
  if (key.type === "PrivateIdentifier") {
    throw new Error("Private names are not valid computed object pattern keys");
  }

  return key;
}
