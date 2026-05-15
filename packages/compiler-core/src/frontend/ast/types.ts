import type {
  Class,
  ClassBody,
  Program,
  ForStatement,
  ForInStatement,
  ForOfStatement,
  Function,
  ArrowFunctionExpression,
  BlockStatement,
  CatchClause,
  StaticBlock,
  RegExpLiteral,
  BigIntLiteral,
  StringLiteral,
  NumericLiteral,
  BooleanLiteral,
  NullLiteral,
  BindingIdentifier,
  SwitchStatement,
  TryStatement,
  JSXIdentifier,
} from "oxc-parser";

export type ScopeOwnerNode =
  | Program
  | Function
  | ArrowFunctionExpression
  | Class
  | ClassBody
  | BlockStatement
  | ForStatement
  | ForInStatement
  | ForOfStatement
  | SwitchStatement
  | TryStatement
  | CatchClause
  | StaticBlock;

/**
 * Identifier syntax node that declares a binding.
 */
export type BindingIdentifierNode = BindingIdentifier;

/**
 * Identifier syntax node used as a binding reference.
 *
 * The node shape is shared with declaration identifiers, so scope analysis must
 * only use this type for identifier reads/writes, not declaration sites.
 */
export type IdentifierReferenceNode = {
  readonly type: "Identifier";
  readonly name: string;
};

/**
 * JSX identifier syntax that resolves through JavaScript scope.
 *
 * Intrinsic tag names such as `<div />` are not represented by this type; only
 * component references such as `<Button />` and the root of `<UI.Button />`
 * are bound by scope analysis.
 */
export type JSXIdentifierReferenceNode = JSXIdentifier;

export type ScopeReferenceNode = IdentifierReferenceNode | JSXIdentifierReferenceNode;

export type LiteralNode =
  | BooleanLiteral
  | NullLiteral
  | NumericLiteral
  | StringLiteral
  | BigIntLiteral
  | RegExpLiteral;
