import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { Place } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildBlockStatement } from "./buildBlockStatement";
import { buildBreakStatement } from "./buildBreakStatement";
import { buildContinueStatement } from "./buildContinueStatement";
import { buildClassDeclaration } from "./buildClassDeclaration";
import { buildDebuggerStatement } from "./buildDebuggerStatement";
import { buildDoWhileStatement } from "./buildDoWhileStatement";
import { buildExportAllDeclaration } from "./buildExportAllDeclaration";
import { buildExportDefaultDeclaration } from "./buildExportDefaultDeclaration";
import { buildExportNamedDeclaration } from "./buildExportNamedDeclaration";
import { buildExpressionStatement } from "./buildExpressionStatement";
import { buildForInStatement } from "./buildForInStatement";
import { buildForOfStatement } from "./buildForOfStatement";
import { buildForStatement } from "./buildForStatement";
import { buildFunctionDeclaration } from "./buildFunctionDeclaration";
import { buildIfStatement } from "./buildIfStatement";
import { buildLabeledStatement } from "./buildLabeledStatement";
import { buildImportDeclaration } from "./buildImportDeclaration";
import { buildReturnStatement } from "./buildReturnStatement";
import { buildSwitchStatement } from "./buildSwitchStatement";
import { buildThrowStatement } from "./buildThrowStatement";
import { buildTryStatement } from "./buildTryStatement";
import { buildVariableDeclaration } from "./buildVariableDeclaration";
import { buildWhileStatement } from "./buildWhileStatement";

export function buildStatement(
  node: ESTree.Statement | ESTree.ModuleDeclaration,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place | Place[] | undefined {
  switch (node.type) {
    case "BreakStatement":
      return buildBreakStatement(node, functionBuilder, environment);
    case "BlockStatement":
      return buildBlockStatement(node, scope, functionBuilder, moduleBuilder, environment);
    case "ContinueStatement":
      return buildContinueStatement(node, functionBuilder, environment);
    case "ClassDeclaration":
      return buildClassDeclaration(node, scope, functionBuilder, moduleBuilder, environment);
    case "DebuggerStatement":
      return buildDebuggerStatement(node, functionBuilder, environment);
    case "ExportAllDeclaration":
      return buildExportAllDeclaration(node, functionBuilder, moduleBuilder, environment);
    case "ExportDefaultDeclaration":
      return buildExportDefaultDeclaration(node, scope, functionBuilder, moduleBuilder, environment);
    case "ExportNamedDeclaration":
      return buildExportNamedDeclaration(node, scope, functionBuilder, moduleBuilder, environment);
    case "DoWhileStatement":
      return buildDoWhileStatement(node, scope, functionBuilder, moduleBuilder, environment);
    case "ForStatement":
      return buildForStatement(node, scope, functionBuilder, moduleBuilder, environment);
    case "ForInStatement":
      return buildForInStatement(node, scope, functionBuilder, moduleBuilder, environment);
    case "ForOfStatement":
      return buildForOfStatement(node, scope, functionBuilder, moduleBuilder, environment);
    case "IfStatement":
      return buildIfStatement(node, scope, functionBuilder, moduleBuilder, environment);
    case "LabeledStatement":
      return buildLabeledStatement(node, scope, functionBuilder, moduleBuilder, environment);
    case "ImportDeclaration":
      return buildImportDeclaration(node, scope, functionBuilder, moduleBuilder, environment);
    case "ExpressionStatement":
      return buildExpressionStatement(node, scope, functionBuilder, moduleBuilder, environment);
    case "FunctionDeclaration":
      return buildFunctionDeclaration(node, functionBuilder, moduleBuilder, environment);
    case "ReturnStatement":
      return buildReturnStatement(node, scope, functionBuilder, moduleBuilder, environment);
    case "VariableDeclaration":
      return buildVariableDeclaration(node, scope, functionBuilder, moduleBuilder, environment);
    case "WhileStatement":
      return buildWhileStatement(node, scope, functionBuilder, moduleBuilder, environment);
    case "ThrowStatement":
      return buildThrowStatement(node, scope, functionBuilder, moduleBuilder, environment);
    case "SwitchStatement":
      return buildSwitchStatement(node, scope, functionBuilder, moduleBuilder, environment);
    case "TryStatement":
      return buildTryStatement(node, scope, functionBuilder, moduleBuilder, environment);
    case "EmptyStatement":
      return undefined;
    default:
      throw new Error(`Unsupported node type: ${(node as ESTree.Node).type}`);
  }
}
