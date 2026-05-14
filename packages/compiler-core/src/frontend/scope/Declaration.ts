import type { Function } from "oxc-parser";

import type { DeclarationId } from "../../ir/core/Value";

/**
 * Source-level binding discovered during ECMAScript scope analysis.
 *
 * A declaration represents a source binding, not a particular SSA value.
 * Binding category follows ECMAScript environment semantics rather than raw
 * syntax node names.
 */
export type Declaration =
  | VarDeclaration
  | LexicalDeclaration
  | FunctionDeclaration
  | ParameterDeclaration
  | ImportDeclaration
  | CatchParameterDeclaration;

export interface BaseDeclaration {
  readonly id: DeclarationId;
  readonly name: string;
}

/**
 * `var` binding.
 *
 * Var declarations are function-scoped or module/global-scoped, not
 * block-scoped.
 */
export interface VarDeclaration extends BaseDeclaration {
  readonly kind: "var";
}

/**
 * Lexical binding created by `let`, `const`, or class declarations.
 *
 * These bindings are created before evaluation and initialized later, which is
 * the source of TDZ behavior.
 */
export interface LexicalDeclaration extends BaseDeclaration {
  readonly kind: "lexical";
  readonly mode: "let" | "const" | "class";
}

/**
 * Hoistable function binding.
 *
 * Function declarations have special instantiation rules and should not be
 * collapsed into plain `var` or plain lexical declarations too early.
 */
export interface FunctionDeclaration extends BaseDeclaration {
  readonly kind: "function";
  readonly functionKind: "function" | "generator" | "async-function" | "async-generator";
  readonly node: Function;
}

/**
 * Function parameter binding.
 */
export interface ParameterDeclaration extends BaseDeclaration {
  readonly kind: "parameter";
}

/**
 * Imported module binding.
 *
 * Import bindings are immutable indirect bindings into another module
 * environment.
 */
export interface ImportDeclaration extends BaseDeclaration {
  readonly kind: "import";
  readonly source: string;
  readonly importedName: string;
}

/**
 * Catch parameter binding.
 *
 * Catch parameters create their own lexical environment, but keeping them
 * distinct makes catch-scope construction and diagnostics explicit.
 */
export interface CatchParameterDeclaration extends BaseDeclaration {
  readonly kind: "catch-parameter";
}
