import type {
  JSXAttributeItem,
  JSXAttributeName,
  JSXAttributeValue as OxcJSXAttributeValue,
  JSXChild as OxcJSXChild,
  JSXElement,
  JSXElementName,
  JSXExpressionContainer,
  JSXFragment,
  JSXIdentifier,
} from "oxc-parser";
import type { Value } from "../../ir/core/Value";
import {
  JSXElementOp,
  type JSXAttribute,
  type JSXAttributeValue,
  type JSXChild,
  type JSXName,
} from "../../ir/ops/jsx/JSXElementOp";
import { JSXFragmentOp } from "../../ir/ops/jsx/JSXFragmentOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerIdentifier } from "./lowerIdentifier";
import { lowerExpression } from "./lowerExpression";

/**
 * Lowers a JSX element expression while preserving JSX source structure.
 */
export function lowerJSXElement(builder: FunctionIRBuilder, element: JSXElement): Value {
  const name = lowerJSXElementName(builder, element.openingElement.name);
  const attributes = element.openingElement.attributes.map((attribute) =>
    lowerJSXAttribute(builder, attribute),
  );
  const children = element.children.flatMap((child) => lowerJSXChild(builder, child));
  const result = builder.createValue();

  builder.emit(new JSXElementOp(builder.operationId(), name, attributes, children, result));

  return result;
}

/**
 * Lowers a JSX fragment expression while preserving JSX source structure.
 */
export function lowerJSXFragment(builder: FunctionIRBuilder, fragment: JSXFragment): Value {
  const children = fragment.children.flatMap((child) => lowerJSXChild(builder, child));
  const result = builder.createValue();

  builder.emit(new JSXFragmentOp(builder.operationId(), children, result));

  return result;
}

function lowerJSXElementName(
  builder: FunctionIRBuilder,
  name: JSXElementName,
  forceReference = false,
): JSXName {
  switch (name.type) {
    case "JSXIdentifier":
      return lowerJSXIdentifierName(builder, name, forceReference);

    case "JSXMemberExpression":
      return {
        kind: "member",
        object: lowerJSXElementName(builder, name.object, true),
        property: name.property.name,
      };

    case "JSXNamespacedName":
      return {
        kind: "namespace",
        namespace: name.namespace.name,
        name: name.name.name,
      };
  }
}

function lowerJSXIdentifierName(
  builder: FunctionIRBuilder,
  name: JSXIdentifier,
  forceReference: boolean,
): JSXName {
  if (!forceReference && isIntrinsicJSXName(name.name)) {
    return { kind: "intrinsic", name: name.name };
  }

  return {
    kind: "reference",
    sourceName: name.name,
    value: lowerIdentifier(builder, name),
  };
}

function lowerJSXAttribute(builder: FunctionIRBuilder, attribute: JSXAttributeItem): JSXAttribute {
  if (attribute.type === "JSXSpreadAttribute") {
    return {
      kind: "spread",
      argument: lowerExpression(builder, attribute.argument),
    };
  }

  return {
    kind: "attribute",
    name: lowerJSXAttributeName(attribute.name),
    value: attribute.value === null ? null : lowerJSXAttributeValue(builder, attribute.value),
  };
}

function lowerJSXAttributeName(name: JSXAttributeName): JSXName {
  switch (name.type) {
    case "JSXIdentifier":
      return { kind: "intrinsic", name: name.name };

    case "JSXNamespacedName":
      return {
        kind: "namespace",
        namespace: name.namespace.name,
        name: name.name.name,
      };
  }
}

function lowerJSXAttributeValue(
  builder: FunctionIRBuilder,
  value: OxcJSXAttributeValue,
): JSXAttributeValue {
  switch (value.type) {
    case "Literal":
      return { kind: "string", value: value.value };

    case "JSXExpressionContainer":
      return {
        kind: "expression",
        value: lowerJSXExpressionContainer(builder, value),
      };

    case "JSXElement":
      return { kind: "node", value: lowerJSXElement(builder, value) };

    case "JSXFragment":
      return { kind: "node", value: lowerJSXFragment(builder, value) };
  }
}

function lowerJSXChild(builder: FunctionIRBuilder, child: OxcJSXChild): readonly JSXChild[] {
  switch (child.type) {
    case "JSXText":
      return child.value.length === 0 ? [] : [{ kind: "text", value: child.value }];

    case "JSXExpressionContainer":
      if (child.expression.type === "JSXEmptyExpression") return [];
      return [
        {
          kind: "expression",
          value: lowerExpression(builder, child.expression),
        },
      ];

    case "JSXSpreadChild":
      return [
        {
          kind: "spread",
          value: lowerExpression(builder, child.expression),
        },
      ];

    case "JSXElement":
      return [{ kind: "node", value: lowerJSXElement(builder, child) }];

    case "JSXFragment":
      return [{ kind: "node", value: lowerJSXFragment(builder, child) }];
  }
}

function lowerJSXExpressionContainer(
  builder: FunctionIRBuilder,
  container: JSXExpressionContainer,
): Value {
  if (container.expression.type === "JSXEmptyExpression") {
    throw new Error("JSX attribute expression cannot be empty");
  }

  return lowerExpression(builder, container.expression);
}

function isIntrinsicJSXName(name: string): boolean {
  return /^[a-z]/.test(name);
}
