import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { Place } from "../../../ir";
import { buildUnsupportedNode } from "../buildUnsupportedNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
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

export function buildJSX(
  nodePath: NodePath<t.JSX>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place | undefined {
  switch (nodePath.type) {
    case "JSXElement":
      nodePath.assertJSXElement();
      return buildJSXElement(nodePath, functionBuilder, moduleBuilder, environment);
    case "JSXFragment":
      nodePath.assertJSXFragment();
      return buildJSXFragment(nodePath, functionBuilder, moduleBuilder, environment);
    case "JSXText":
      nodePath.assertJSXText();
      return buildJSXText(nodePath, functionBuilder, environment);
    case "JSXClosingElement":
      nodePath.assertJSXClosingElement();
      return buildJSXClosingElement(nodePath, functionBuilder, moduleBuilder, environment);
    case "JSXOpeningFragment":
      nodePath.assertJSXOpeningFragment();
      return buildJSXOpeningFragment(nodePath, functionBuilder, environment);
    case "JSXClosingFragment":
      nodePath.assertJSXClosingFragment();
      return buildJSXClosingFragment(nodePath, functionBuilder, environment);
    case "JSXIdentifier":
      nodePath.assertJSXIdentifier();
      return buildJSXIdentifier(nodePath, functionBuilder, environment);
    case "JSXMemberExpression":
      nodePath.assertJSXMemberExpression();
      return buildJSXMemberExpression(nodePath, functionBuilder, moduleBuilder, environment);
    case "JSXNamespacedName":
      nodePath.assertJSXNamespacedName();
      return buildJSXNamespacedName(nodePath, functionBuilder, environment);
    case "JSXAttribute":
      nodePath.assertJSXAttribute();
      return buildJSXAttribute(nodePath, functionBuilder, moduleBuilder, environment);
    case "JSXSpreadAttribute":
      nodePath.assertJSXSpreadAttribute();
      return buildJSXSpreadAttribute(nodePath, functionBuilder, moduleBuilder, environment);
    case "JSXExpressionContainer":
      nodePath.assertJSXExpressionContainer();
      return buildJSXExpressionContainer(nodePath, functionBuilder, moduleBuilder, environment);
    default:
      return buildUnsupportedNode(nodePath, functionBuilder, environment);
  }
}
