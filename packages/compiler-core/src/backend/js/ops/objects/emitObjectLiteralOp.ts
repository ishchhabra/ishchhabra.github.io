import type {
  ObjectLiteralAccessorProperty,
  ObjectLiteralMethodProperty,
  ObjectLiteralOp,
} from "../../../../ir/ops/objects/ObjectLiteralOp";
import type { PropertyKey } from "../../../../ir/ops/properties/PropertyKey";
import {
  identifier,
  expressionStatement,
  literal,
  objectExpression,
  objectExpressionProperty,
  spreadElement,
  type ESTreeExpression,
  type ESTreeStatement,
} from "../../ast";
import type { CodegenContext } from "../../CodegenContext";
import { emitFunctionExpression } from "../../functions/emitFunction";

export function emitObjectLiteralOp(
  context: CodegenContext,
  op: ObjectLiteralOp,
): ESTreeStatement[] {
  const expression = objectExpression(
    op.properties.map((property) => {
      switch (property.kind) {
        case "spread":
          return spreadElement(context.expressionForValue(property.value));

        case "property": {
          const key = emitPropertyKey(context, property.key);
          const value = context.expressionForValue(property.value);

          return objectExpressionProperty(
            key.expression,
            value,
            key.computed,
            isShorthandProperty(key.expression, value, key.computed),
          );
        }

        case "method":
          return emitObjectMethod(context, property);

        case "accessor":
          return emitObjectAccessor(context, property);
      }
    }),
  );
  context.values.set(op.result, expression);

  if (op.result.users.size === 0) {
    return [expressionStatement(expression)];
  }

  return [];
}

function emitObjectMethod(context: CodegenContext, property: ObjectLiteralMethodProperty) {
  const key = emitPropertyKey(context, property.key);

  return objectExpressionProperty(
    key.expression,
    emitFunctionExpression(context, property.functionIR),
    key.computed,
    false,
    "init",
    true,
  );
}

function emitObjectAccessor(context: CodegenContext, property: ObjectLiteralAccessorProperty) {
  const key = emitPropertyKey(context, property.key);

  return objectExpressionProperty(
    key.expression,
    emitFunctionExpression(context, property.functionIR),
    key.computed,
    false,
    property.accessor,
    false,
  );
}

function emitPropertyKey(
  context: CodegenContext,
  key: PropertyKey,
): { readonly expression: ESTreeExpression; readonly computed: boolean } {
  if (key.kind === "computed") {
    return {
      expression: context.expressionForValue(key.value),
      computed: true,
    };
  }

  return {
    expression: isIdentifierName(key.name) ? identifier(key.name) : literal(key.name),
    computed: false,
  };
}

function isShorthandProperty(
  key: ESTreeExpression,
  value: ESTreeExpression,
  computed: boolean,
): boolean {
  return (
    !computed && key.type === "Identifier" && value.type === "Identifier" && key.name === value.name
  );
}

function isIdentifierName(name: string): boolean {
  return /^[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*$/u.test(name);
}
