/**
 * ESTree type helpers and re-exports for the frontend.
 *
 * This module provides:
 * 1. Re-exports from estree/estree-jsx for convenient imports
 * 2. Type guards replacing Babel's path.isX() / t.isX() methods
 * 3. Helpers for ESTree vs Babel AST differences
 */

import type * as ESTree from "estree";
import type * as JSX from "estree-jsx";

// Re-export everything for convenient `import type { Identifier, ... } from "../estree"`
export type { ESTree, JSX };

// Union of all ESTree node types the frontend works with
export type Node = ESTree.Node | JSXNode;
export type JSXNode =
  | JSX.JSXElement
  | JSX.JSXFragment
  | JSX.JSXOpeningElement
  | JSX.JSXOpeningFragment
  | JSX.JSXClosingElement
  | JSX.JSXClosingFragment
  | JSX.JSXAttribute
  | JSX.JSXSpreadAttribute
  | JSX.JSXExpressionContainer
  | JSX.JSXText
  | JSX.JSXIdentifier
  | JSX.JSXMemberExpression
  | JSX.JSXNamespacedName
  | JSX.JSXSpreadChild
  | JSX.JSXEmptyExpression;

// -----------------------------------------------------------------------
// Type guards (replace Babel's path.isX() and t.isX())
// -----------------------------------------------------------------------

export function isIdentifier(node: Node): node is ESTree.Identifier {
  return node.type === "Identifier";
}

export function isLiteral(node: Node): node is ESTree.Literal {
  return node.type === "Literal";
}

export function isStringLiteral(node: Node): node is ESTree.SimpleLiteral & { value: string } {
  return node.type === "Literal" && typeof (node as ESTree.Literal).value === "string";
}

export function isNumericLiteral(node: Node): node is ESTree.SimpleLiteral & { value: number } {
  return node.type === "Literal" && typeof (node as ESTree.Literal).value === "number";
}

export function isBooleanLiteral(node: Node): node is ESTree.SimpleLiteral & { value: boolean } {
  return node.type === "Literal" && typeof (node as ESTree.Literal).value === "boolean";
}

export function isNullLiteral(node: Node): node is ESTree.SimpleLiteral & { value: null } {
  return node.type === "Literal" && (node as ESTree.Literal).value === null;
}

export function isRegExpLiteral(node: Node): node is ESTree.RegExpLiteral {
  return node.type === "Literal" && "regex" in node;
}

export function isBigIntLiteral(node: Node): node is ESTree.BigIntLiteral {
  return node.type === "Literal" && "bigint" in node;
}

export function isExpression(node: Node): node is ESTree.Expression {
  switch (node.type) {
    case "Identifier":
    case "Literal":
    case "ThisExpression":
    case "ArrayExpression":
    case "ObjectExpression":
    case "FunctionExpression":
    case "UnaryExpression":
    case "UpdateExpression":
    case "BinaryExpression":
    case "AssignmentExpression":
    case "LogicalExpression":
    case "MemberExpression":
    case "ConditionalExpression":
    case "CallExpression":
    case "NewExpression":
    case "SequenceExpression":
    case "ArrowFunctionExpression":
    case "YieldExpression":
    case "TemplateLiteral":
    case "TaggedTemplateExpression":
    case "ClassExpression":
    case "MetaProperty":
    case "AwaitExpression":
    case "ChainExpression":
    case "ImportExpression":
    case "JSXElement":
    case "JSXFragment":
      return true;
    default:
      return false;
  }
}

export function isStatement(node: Node): node is ESTree.Statement {
  switch (node.type) {
    case "ExpressionStatement":
    case "BlockStatement":
    case "EmptyStatement":
    case "DebuggerStatement":
    case "ReturnStatement":
    case "LabeledStatement":
    case "BreakStatement":
    case "ContinueStatement":
    case "IfStatement":
    case "SwitchStatement":
    case "ThrowStatement":
    case "TryStatement":
    case "WhileStatement":
    case "DoWhileStatement":
    case "ForStatement":
    case "ForInStatement":
    case "ForOfStatement":
    case "VariableDeclaration":
    case "FunctionDeclaration":
    case "ClassDeclaration":
    case "ImportDeclaration":
    case "ExportNamedDeclaration":
    case "ExportDefaultDeclaration":
    case "ExportAllDeclaration":
      return true;
    default:
      return false;
  }
}

export function isPattern(node: Node): node is ESTree.Pattern {
  switch (node.type) {
    case "Identifier":
    case "ObjectPattern":
    case "ArrayPattern":
    case "RestElement":
    case "AssignmentPattern":
      return true;
    default:
      return false;
  }
}

export function isLVal(node: Node): node is ESTree.Pattern {
  return isPattern(node);
}

export function isFunction(node: Node): node is ESTree.Function {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

export function isJSX(node: Node): boolean {
  return node.type.startsWith("JSX");
}

/**
 * Check if a node is a TS-only declaration that should be skipped during
 * IR lowering (when parsing TS with astType: 'js', these remain in the AST).
 */
export function isTSOnlyNode(node: Node): boolean {
  return node.type.startsWith("TS");
}
