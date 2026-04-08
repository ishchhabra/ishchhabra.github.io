import type * as Oxc from "oxc-parser";
import type {
  Expression,
  Node,
  Statement,
  TSAsExpression,
  TSInstantiationExpression,
  TSNonNullExpression,
  TSSatisfiesExpression,
  TSTypeAssertion,
} from "oxc-parser";

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

export type Pattern =
  | Oxc.BindingPattern
  | Oxc.BindingRestElement
  | Oxc.AssignmentTarget
  | Oxc.AssignmentTargetRest
  | Oxc.AssignmentTargetMaybeDefault
  | Oxc.AssignmentTargetWithDefault
  | Oxc.FormalParameterRest
  | Oxc.ParamPattern;
export type RestElement =
  | Oxc.BindingRestElement
  | Oxc.AssignmentTargetRest
  | Oxc.FormalParameterRest;
export type ArrayPattern = Oxc.ArrayPattern | Oxc.ArrayAssignmentTarget;
export type ObjectPattern = Oxc.ObjectPattern | Oxc.ObjectAssignmentTarget;
export type AssignmentPattern = Oxc.AssignmentPattern | Oxc.AssignmentTargetWithDefault;
export type Property =
  | Oxc.ObjectProperty
  | Oxc.BindingProperty
  | Oxc.AssignmentTargetPropertyIdentifier
  | Oxc.AssignmentTargetPropertyProperty;
export type BinaryExpression = Oxc.BinaryExpression | Oxc.PrivateInExpression;

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

/** Kinds that wrap a value expression and erase to it in emitted JS (Oxc `astType: "ts"`). */
const TS_TYPE_EXPRESSION_WRAPPER_KINDS = new Set<string>([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "TSInstantiationExpression",
]);

/**
 * Walk past TypeScript type-syntax wrappers whose runtime value is the inner
 * `expression`. Aligns with the unwrap pass in `buildNode`.
 */
export function unwrapTSTypeWrappers(node: Node): Node {
  let current: Node = node;
  while (TS_TYPE_EXPRESSION_WRAPPER_KINDS.has(current.type)) {
    current = (current as TSAsExpression).expression;
  }
  return current;
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

export function isFunction(node: Node): node is Oxc.Function | Oxc.ArrowFunctionExpression {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

export function isJSX(node: Node): boolean {
  return node.type.startsWith("JSX");
}

export function isTSOnlyNode(
  node: Node,
): node is
  | TSAsExpression
  | TSSatisfiesExpression
  | TSNonNullExpression
  | TSTypeAssertion
  | TSInstantiationExpression {
  return node.type.startsWith("TS");
}
