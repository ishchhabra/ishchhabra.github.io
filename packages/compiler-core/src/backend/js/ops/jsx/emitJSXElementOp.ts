import type {
  JSXAttribute,
  JSXAttributeValue,
  JSXChild,
  JSXName,
  JSXElementOp,
} from "../../../../ir/ops/jsx/JSXElementOp";
import {
  expressionStatement,
  jsxAttribute,
  jsxElement,
  jsxExpressionContainer,
  jsxIdentifier,
  jsxMemberExpression,
  jsxNamespacedName,
  jsxSpreadAttribute,
  jsxSpreadChild,
  jsxText,
  literal,
  type ESTreeExpression,
  type ESTreeStatement,
  type JSXAttributeEntryNode,
  type JSXAttributeValueNode,
  type JSXChildNode,
  type JSXMemberExpressionObjectNode,
  type JSXNameNode,
} from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitJSXElementOp(context: CodegenContext, op: JSXElementOp): ESTreeStatement[] {
  const expression = jsxElement(
    emitJSXName(context, op.name),
    op.attributes.map((attribute) => emitJSXAttribute(context, attribute)),
    op.children.map((child) => emitJSXChild(context, child)),
  );

  context.values.set(op.result, expression);

  if (op.result.users.size === 0) {
    return [expressionStatement(expression)];
  }

  return [];
}

export function emitJSXName(context: CodegenContext, name: JSXName): JSXNameNode {
  switch (name.kind) {
    case "intrinsic":
      return jsxIdentifier(name.name);

    case "reference":
      return expressionToJSXIdentifier(context.expressionForValue(name.value), name.sourceName);

    case "member":
      return jsxMemberExpression(
        emitJSXMemberObject(context, name.object),
        jsxIdentifier(name.property),
      );

    case "namespace":
      return jsxNamespacedName(jsxIdentifier(name.namespace), jsxIdentifier(name.name));
  }
}

export function emitJSXChild(context: CodegenContext, child: JSXChild): JSXChildNode {
  switch (child.kind) {
    case "text":
      return jsxText(child.value);

    case "expression":
      return jsxExpressionContainer(context.expressionForValue(child.value));

    case "spread":
      return jsxSpreadChild(context.expressionForValue(child.value));

    case "node":
      return expressionToJSXChild(context.expressionForValue(child.value));
  }
}

function emitJSXAttribute(context: CodegenContext, attribute: JSXAttribute): JSXAttributeEntryNode {
  switch (attribute.kind) {
    case "spread":
      return jsxSpreadAttribute(context.expressionForValue(attribute.argument));

    case "attribute":
      return jsxAttribute(
        emitJSXAttributeName(context, attribute.name),
        emitJSXAttributeValue(context, attribute.value),
      );
  }
}

function emitJSXAttributeName(context: CodegenContext, name: JSXName) {
  const emitted = emitJSXName(context, name);
  if (emitted.type === "JSXMemberExpression") {
    throw new Error("JSX attribute names cannot be member expressions");
  }

  return emitted;
}

function emitJSXAttributeValue(
  context: CodegenContext,
  value: JSXAttributeValue | null,
): JSXAttributeValueNode | null {
  if (value === null) return null;

  switch (value.kind) {
    case "string":
      return literal(value.value);

    case "expression":
      return jsxExpressionContainer(context.expressionForValue(value.value));

    case "node":
      return expressionToJSXAttributeValue(context.expressionForValue(value.value));
  }
}

function emitJSXMemberObject(
  context: CodegenContext,
  name: JSXName,
): JSXMemberExpressionObjectNode {
  const emitted = emitJSXName(context, name);
  if (emitted.type === "JSXNamespacedName") {
    throw new Error("JSX namespaced names cannot be member expression objects");
  }

  return emitted;
}

function expressionToJSXIdentifier(expression: ESTreeExpression, sourceName: string) {
  if (expression.type === "Identifier") {
    return jsxIdentifier(expression.name);
  }

  throw new Error(
    `JSX reference ${sourceName} must materialize as an identifier, got ${expression.type}`,
  );
}

function expressionToJSXChild(expression: ESTreeExpression): JSXChildNode {
  if (expression.type === "JSXElement" || expression.type === "JSXFragment") {
    return expression;
  }

  return jsxExpressionContainer(expression);
}

function expressionToJSXAttributeValue(expression: ESTreeExpression): JSXAttributeValueNode {
  if (expression.type === "JSXElement" || expression.type === "JSXFragment") {
    return expression;
  }

  return jsxExpressionContainer(expression);
}
