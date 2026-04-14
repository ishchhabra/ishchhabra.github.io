import type {
  JSXAttribute,
  JSXClosingElement,
  JSXClosingFragment,
  JSXElement,
  JSXExpressionContainer,
  JSXFragment,
  JSXIdentifier,
  JSXMemberExpression,
  JSXNamespacedName,
  JSXOpeningFragment,
  JSXSpreadAttribute,
  JSXText,
} from "oxc-parser";
import { Environment } from "../../../environment";
import { Place } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildJSXAttribute } from "./buildJSXAttribute";
import { buildJSXSpreadAttribute } from "./buildJSXSpreadAttribute";
import { buildJSXClosingElement } from "./buildJSXClosingElement";
import { buildJSXClosingFragment } from "./buildJSXClosingFragment";
import { buildJSXElement } from "./buildJSXElement";
import { buildJSXExpressionContainer } from "./buildJSXExpressionContainer";
import { buildJSXFragment } from "./buildJSXFragment";
import { buildJSXIdentifier } from "./buildJSXIdentifier";
import { buildJSXMemberExpression } from "./buildJSXMemberExpression";
import { buildJSXNamespacedName } from "./buildJSXNamespacedName";
import { buildJSXOpeningFragment } from "./buildJSXOpeningFragment";
import { buildJSXText } from "./buildJSXText";

type JSXNode =
  | JSXElement
  | JSXFragment
  | JSXText
  | JSXClosingElement
  | JSXOpeningFragment
  | JSXClosingFragment
  | JSXIdentifier
  | JSXMemberExpression
  | JSXNamespacedName
  | JSXAttribute
  | JSXSpreadAttribute
  | JSXExpressionContainer;

export function buildJSX(
  node: JSXNode,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place | undefined {
  switch (node.type) {
    case "JSXElement":
      return buildJSXElement(node, scope, functionBuilder, moduleBuilder, environment);
    case "JSXFragment":
      return buildJSXFragment(node, scope, functionBuilder, moduleBuilder, environment);
    case "JSXText":
      return buildJSXText(node, functionBuilder, environment);
    case "JSXClosingElement":
      return buildJSXClosingElement(node, scope, functionBuilder, moduleBuilder, environment);
    case "JSXOpeningFragment":
      return buildJSXOpeningFragment(node, functionBuilder, environment);
    case "JSXClosingFragment":
      return buildJSXClosingFragment(node, functionBuilder, environment);
    case "JSXIdentifier":
      return buildJSXIdentifier(node, scope, functionBuilder, environment);
    case "JSXMemberExpression":
      return buildJSXMemberExpression(node, scope, functionBuilder, moduleBuilder, environment);
    case "JSXNamespacedName":
      return buildJSXNamespacedName(node, functionBuilder, environment);
    case "JSXAttribute":
      return buildJSXAttribute(node, scope, functionBuilder, moduleBuilder, environment);
    case "JSXSpreadAttribute":
      return buildJSXSpreadAttribute(node, scope, functionBuilder, moduleBuilder, environment);
    case "JSXExpressionContainer":
      return buildJSXExpressionContainer(node, scope, functionBuilder, moduleBuilder, environment);
    default:
      throw new Error(`Unsupported JSX node type: ${(node as { type: string }).type}`);
  }
}
