import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { Place } from "../../../ir";
import { buildUnsupportedNode } from "../buildUnsupportedNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildBreakStatement } from "./buildBreakStatement";
import { buildBlockStatement } from "./buildBlockStatement";
import { buildExportDefaultDeclaration } from "./buildExportDefaultDeclaration";
import { buildExportNamedDeclaration } from "./buildExportNamedDeclaration";
import { buildExpressionStatement } from "./buildExpressionStatement";
import { buildForOfStatement } from "./buildForOfStatement";
import { buildForStatement } from "./buildForStatement";
import { buildFunctionDeclaration } from "./buildFunctionDeclaration";
import { buildIfStatement } from "./buildIfStatement";
import { buildImportDeclaration } from "./buildImportDeclaration";
import { buildReturnStatement } from "./buildReturnStatement";
import { buildSwitchStatement } from "./buildSwitchStatement";
import { buildThrowStatement } from "./buildThrowStatement";
import { buildTryStatement } from "./buildTryStatement";
import { buildVariableDeclaration } from "./buildVariableDeclaration";
import { buildWhileStatement } from "./buildWhileStatement";

export function buildStatement(
  nodePath: NodePath<t.Statement>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place | Place[] | undefined {
  switch (nodePath.type) {
    case "BreakStatement":
      nodePath.assertBreakStatement();
      return buildBreakStatement(nodePath, functionBuilder, environment);
    case "BlockStatement":
      nodePath.assertBlockStatement();
      return buildBlockStatement(nodePath, functionBuilder, moduleBuilder, environment);
    case "ExportDefaultDeclaration":
      nodePath.assertExportDefaultDeclaration();
      return buildExportDefaultDeclaration(nodePath, functionBuilder, moduleBuilder, environment);
    case "ExportNamedDeclaration":
      nodePath.assertExportNamedDeclaration();
      return buildExportNamedDeclaration(nodePath, functionBuilder, moduleBuilder, environment);
    case "ForStatement":
      nodePath.assertForStatement();
      return buildForStatement(nodePath, functionBuilder, moduleBuilder, environment);
    case "IfStatement":
      nodePath.assertIfStatement();
      return buildIfStatement(nodePath, functionBuilder, moduleBuilder, environment);
    case "ImportDeclaration":
      nodePath.assertImportDeclaration();
      return buildImportDeclaration(nodePath, functionBuilder, moduleBuilder, environment);
    case "ExpressionStatement":
      nodePath.assertExpressionStatement();
      return buildExpressionStatement(nodePath, functionBuilder, moduleBuilder, environment);
    case "FunctionDeclaration":
      nodePath.assertFunctionDeclaration();
      return buildFunctionDeclaration(nodePath, functionBuilder, moduleBuilder, environment);
    case "ReturnStatement":
      nodePath.assertReturnStatement();
      return buildReturnStatement(nodePath, functionBuilder, moduleBuilder, environment);
    case "VariableDeclaration":
      nodePath.assertVariableDeclaration();
      return buildVariableDeclaration(nodePath, functionBuilder, moduleBuilder, environment);
    case "WhileStatement":
      nodePath.assertWhileStatement();
      return buildWhileStatement(nodePath, functionBuilder, moduleBuilder, environment);
    case "ForOfStatement":
      nodePath.assertForOfStatement();
      return buildForOfStatement(nodePath, functionBuilder, moduleBuilder, environment);
    case "ThrowStatement":
      nodePath.assertThrowStatement();
      return buildThrowStatement(nodePath, functionBuilder, moduleBuilder, environment);
    case "SwitchStatement":
      nodePath.assertSwitchStatement();
      return buildSwitchStatement(nodePath, functionBuilder, moduleBuilder, environment);
    case "TryStatement":
      nodePath.assertTryStatement();
      return buildTryStatement(nodePath, functionBuilder, moduleBuilder, environment);
    default:
      return buildUnsupportedNode(nodePath, functionBuilder, environment);
  }
}
