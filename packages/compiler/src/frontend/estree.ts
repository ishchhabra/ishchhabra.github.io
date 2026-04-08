import type * as Oxc from "@oxc-project/types";

export type Node = Oxc.Node;
export type Program = Oxc.Program;
export type Statement = Oxc.Statement;
export type ModuleDeclaration = Oxc.ModuleDeclaration;
export type Directive = Oxc.Directive;
export type Declaration = Oxc.Declaration;
export type Expression = Oxc.Expression;
export type Identifier =
  | Oxc.IdentifierName
  | Oxc.IdentifierReference
  | Oxc.BindingIdentifier
  | Oxc.LabelIdentifier
  | Oxc.TSThisParameter
  | Oxc.TSIndexSignatureName;
export type Literal =
  | Oxc.BooleanLiteral
  | Oxc.NullLiteral
  | Oxc.NumericLiteral
  | Oxc.StringLiteral
  | Oxc.BigIntLiteral
  | Oxc.RegExpLiteral;
export type SimpleLiteral = Exclude<Literal, Oxc.RegExpLiteral>;
export type RegExpLiteral = Oxc.RegExpLiteral;
export type BigIntLiteral = Oxc.BigIntLiteral;

export type Pattern =
  | Oxc.BindingPattern
  | Oxc.BindingRestElement
  | Oxc.AssignmentTarget
  | Oxc.AssignmentTargetRest
  | Oxc.AssignmentTargetMaybeDefault
  | Oxc.AssignmentTargetWithDefault
  | Oxc.FormalParameterRest
  | Oxc.ParamPattern;
export type RestElement = Oxc.BindingRestElement | Oxc.AssignmentTargetRest | Oxc.FormalParameterRest;
export type Function = Oxc.Function;
export type FunctionDeclaration = Oxc.Function;
export type FunctionExpression = Oxc.Function;
export type Class = Oxc.Class;
export type ClassDeclaration = Oxc.Class;
export type ClassExpression = Oxc.Class;
export type VariableDeclaration = Oxc.VariableDeclaration;
export type VariableDeclarator = Oxc.VariableDeclarator;
export type BlockStatement = Oxc.BlockStatement;
export type ArrayPattern = Oxc.ArrayPattern | Oxc.ArrayAssignmentTarget;
export type ObjectPattern = Oxc.ObjectPattern | Oxc.ObjectAssignmentTarget;
export type AssignmentPattern = Oxc.AssignmentPattern | Oxc.AssignmentTargetWithDefault;
export type Property =
  | Oxc.ObjectProperty
  | Oxc.BindingProperty
  | Oxc.AssignmentTargetPropertyIdentifier
  | Oxc.AssignmentTargetPropertyProperty;
export type SpreadElement = Oxc.SpreadElement;
export type PrivateIdentifier = Oxc.PrivateIdentifier;
export type MetaProperty = Oxc.MetaProperty;
export type MemberExpression = Oxc.MemberExpression;
export type ArrayExpression = Oxc.ArrayExpression;
export type AssignmentExpression = Oxc.AssignmentExpression;
export type ArrowFunctionExpression = Oxc.ArrowFunctionExpression;
export type AwaitExpression = Oxc.AwaitExpression;
export type BinaryExpression = Oxc.BinaryExpression | Oxc.PrivateInExpression;
export type CallExpression = Oxc.CallExpression;
export type SimpleCallExpression = Oxc.CallExpression;
export type ConditionalExpression = Oxc.ConditionalExpression;
export type ImportExpression = Oxc.ImportExpression;
export type LogicalExpression = Oxc.LogicalExpression;
export type NewExpression = Oxc.NewExpression;
export type ObjectExpression = Oxc.ObjectExpression;
export type SequenceExpression = Oxc.SequenceExpression;
export type TaggedTemplateExpression = Oxc.TaggedTemplateExpression;
export type TemplateLiteral = Oxc.TemplateLiteral;
export type ThisExpression = Oxc.ThisExpression;
export type UnaryExpression = Oxc.UnaryExpression;
export type UpdateExpression = Oxc.UpdateExpression;
export type YieldExpression = Oxc.YieldExpression;
export type BreakStatement = Oxc.BreakStatement;
export type ContinueStatement = Oxc.ContinueStatement;
export type DebuggerStatement = Oxc.DebuggerStatement;
export type DoWhileStatement = Oxc.DoWhileStatement;
export type ExportAllDeclaration = Oxc.ExportAllDeclaration;
export type ExportDefaultDeclaration = Oxc.ExportDefaultDeclaration;
export type ExportNamedDeclaration = Oxc.ExportNamedDeclaration;
export type ExportSpecifier = Oxc.ExportSpecifier;
export type ExpressionStatement = Oxc.ExpressionStatement;
export type ForInStatement = Oxc.ForInStatement;
export type ForOfStatement = Oxc.ForOfStatement;
export type ForStatement = Oxc.ForStatement;
export type IfStatement = Oxc.IfStatement;
export type ImportDeclaration = Oxc.ImportDeclaration;
export type ImportOrExportKind = Oxc.ImportOrExportKind;
export type ImportSpecifier = Oxc.ImportSpecifier;
export type ImportDefaultSpecifier = Oxc.ImportDefaultSpecifier;
export type ImportNamespaceSpecifier = Oxc.ImportNamespaceSpecifier;
export type LabeledStatement = Oxc.LabeledStatement;
export type ReturnStatement = Oxc.ReturnStatement;
export type SwitchStatement = Oxc.SwitchStatement;
export type ThrowStatement = Oxc.ThrowStatement;
export type TryStatement = Oxc.TryStatement;
export type WhileStatement = Oxc.WhileStatement;
export type CatchClause = Oxc.CatchClause;
export type MethodDefinition = Oxc.MethodDefinition;
export type PropertyDefinition = Oxc.PropertyDefinition;

export type JSXNode =
  | Oxc.JSXElement
  | Oxc.JSXFragment
  | Oxc.JSXOpeningElement
  | Oxc.JSXOpeningFragment
  | Oxc.JSXClosingElement
  | Oxc.JSXClosingFragment
  | Oxc.JSXAttribute
  | Oxc.JSXSpreadAttribute
  | Oxc.JSXExpressionContainer
  | Oxc.JSXText
  | Oxc.JSXIdentifier
  | Oxc.JSXMemberExpression
  | Oxc.JSXNamespacedName
  | Oxc.JSXSpreadChild
  | Oxc.JSXEmptyExpression;
export type JSXElement = Oxc.JSXElement;
export type JSXFragment = Oxc.JSXFragment;
export type JSXOpeningElement = Oxc.JSXOpeningElement;
export type JSXOpeningFragment = Oxc.JSXOpeningFragment;
export type JSXClosingElement = Oxc.JSXClosingElement;
export type JSXClosingFragment = Oxc.JSXClosingFragment;
export type JSXAttribute = Oxc.JSXAttribute;
export type JSXSpreadAttribute = Oxc.JSXSpreadAttribute;
export type JSXExpressionContainer = Oxc.JSXExpressionContainer;
export type JSXText = Oxc.JSXText;
export type JSXIdentifier = Oxc.JSXIdentifier;
export type JSXMemberExpression = Oxc.JSXMemberExpression;
export type JSXNamespacedName = Oxc.JSXNamespacedName;
export type JSXSpreadChild = Oxc.JSXSpreadChild;
export type JSXEmptyExpression = Oxc.JSXEmptyExpression;

export function isIdentifier(node: Node): node is Identifier {
  return node.type === "Identifier";
}

export function isLiteral(node: Node): node is Literal {
  return node.type === "Literal";
}

export function isStringLiteral(node: Node): node is Oxc.StringLiteral {
  return node.type === "Literal" && typeof node.value === "string";
}

export function isNumericLiteral(node: Node): node is Oxc.NumericLiteral {
  return node.type === "Literal" && typeof node.value === "number";
}

export function isBooleanLiteral(node: Node): node is Oxc.BooleanLiteral {
  return node.type === "Literal" && typeof node.value === "boolean";
}

export function isNullLiteral(node: Node): node is Oxc.NullLiteral {
  return node.type === "Literal" && node.value === null;
}

export function isRegExpLiteral(node: Node): node is Oxc.RegExpLiteral {
  return node.type === "Literal" && "regex" in node;
}

export function isBigIntLiteral(node: Node): node is Oxc.BigIntLiteral {
  return node.type === "Literal" && "bigint" in node;
}

export function isExpression(node: Node): node is Expression {
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

export function isStatement(node: Node): node is Statement {
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

export function isPattern(node: Node): node is Pattern {
  switch (node.type) {
    case "Identifier":
    case "ObjectPattern":
    case "ArrayPattern":
    case "RestElement":
    case "AssignmentPattern":
    case "MemberExpression":
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression":
    case "TSTypeAssertion":
    case "TSParameterProperty":
      return true;
    default:
      return false;
  }
}

export function isLVal(node: Node): node is Pattern {
  return isPattern(node);
}

export function isFunction(node: Node): node is Function | Oxc.ArrowFunctionExpression {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

export function isJSX(node: Node): boolean {
  return node.type.startsWith("JSX");
}

export function isTSOnlyNode(node: Node): boolean {
  return node.type.startsWith("TS");
}
