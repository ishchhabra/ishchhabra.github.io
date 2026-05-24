import type {
  BindingPattern,
  BindingRestElement,
  Expression,
  PrivateIdentifier,
  PropertyKey as OxcPropertyKey,
} from "oxc-parser";

import type { BindingPatternTarget } from "../../ir/core/DestructurePattern";
import type { PatternExpression, PatternPropertyKey } from "../../ir/core/DestructurePattern";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerDeferredExpression } from "../functions/lowerDeferredExpression";

/**
 * Converts an ECMAScript binding pattern into compiler-owned IR pattern data.
 */
export function lowerBindingPatternTarget(
  builder: FunctionIRBuilder,
  pattern: BindingPattern | BindingRestElement,
): BindingPatternTarget {
  switch (pattern.type) {
    case "Identifier": {
      const declaration = builder.declarationForBinding(pattern);
      return {
        kind: "binding",
        declarationId: declaration.id,
        bindingValue: builder.createValue(declaration.id),
      };
    }

    case "ArrayPattern":
      return {
        kind: "array",
        elements: pattern.elements.map((element) =>
          element === null ? null : lowerBindingPatternTarget(builder, element),
        ),
      };

    case "ObjectPattern":
      return {
        kind: "object",
        properties: pattern.properties.map((property) => {
          if (property.type === "RestElement") {
            return {
              kind: "rest",
              target: lowerBindingPatternTarget(builder, property.argument),
            };
          }

          return {
            kind: "property",
            key: lowerObjectPatternKey(builder, property.key, property.computed),
            target: lowerBindingPatternTarget(builder, property.value),
          };
        }),
      };

    case "AssignmentPattern": {
      return {
        kind: "default",
        target: lowerBindingPatternTarget(builder, pattern.left),
        expression: lowerPatternExpression(builder, pattern.right),
      };
    }

    case "RestElement":
      return {
        kind: "rest",
        target: lowerBindingPatternTarget(builder, pattern.argument),
      };
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
    throw new Error("Private names are not valid object binding pattern keys");
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
        throw new Error(`Unsupported object binding pattern literal key: ${String(key.value)}`);
      }

      return { kind: "static", name: String(key.value) };

    default:
      throw new Error(`Unsupported object binding pattern key: ${key.type}`);
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
