import * as t from "@babel/types";

/**
 * Codegen normalization primitives.
 *
 * These take the output of {@link generateBasicBlock} — a flat list
 * of JS statements — and reshape it to fit restricted syntactic slots
 * (for-init, for-update, while-cond, conditional-expression arms,
 * etc.) that JS grammar permits only expressions / declarators, not
 * arbitrary statements.
 *
 * The emitters stay shape-stable. Consumers compose these primitives
 * when their target slot has a grammar constraint.
 */

/**
 * Split a list of statements into the three pieces a JS `for`-loop
 * needs to place them:
 *
 *   - `declarators` — one per `let $x = expr;` statement, as a bare
 *     {@link t.VariableDeclarator} (no initializer). Intended to be
 *     appended to the for-init slot's declarator list.
 *   - `expressions` — expressions that belong in the for-update slot,
 *     in original source order. For a split `let $x = expr;`, the
 *     bare `$x = expr` assignment expression goes here. For a plain
 *     {@link t.ExpressionStatement}, its expression goes here.
 *   - `rejected` — statements that can't be reshaped (function
 *     declarations, blocks, ifs, etc.). Caller decides the fallback.
 *
 * Mixed-kind declarations (mixing `let`/`const`/`var`) aren't split;
 * we defer to the caller. In practice updateBlocks hold only the ops
 * the source update clause emits, which are uniform.
 */
export function splitForUpdate(stmts: readonly t.Statement[]): {
  declarators: t.VariableDeclarator[];
  expressions: t.Expression[];
  rejected: t.Statement[];
} {
  const declarators: t.VariableDeclarator[] = [];
  const expressions: t.Expression[] = [];
  const rejected: t.Statement[] = [];

  for (const stmt of stmts) {
    if (t.isExpressionStatement(stmt)) {
      expressions.push(stmt.expression);
      continue;
    }
    if (t.isVariableDeclaration(stmt)) {
      let allIdent = true;
      for (const decl of stmt.declarations) {
        if (!t.isIdentifier(decl.id)) {
          allIdent = false;
          break;
        }
      }
      if (!allIdent) {
        rejected.push(stmt);
        continue;
      }
      for (const decl of stmt.declarations) {
        const id = decl.id as t.Identifier;
        declarators.push(t.variableDeclarator(t.identifier(id.name)));
        if (decl.init !== null && decl.init !== undefined) {
          expressions.push(t.assignmentExpression("=", t.identifier(id.name), decl.init));
        }
      }
      continue;
    }
    rejected.push(stmt);
  }

  return { declarators, expressions, rejected };
}

/**
 * Fold a list of expressions into a single expression using the
 * comma (sequence) operator. Returns `null` for an empty list, the
 * single expression when the list has one element, otherwise a
 * {@link t.SequenceExpression}.
 */
export function toSequence(exprs: readonly t.Expression[]): t.Expression | null {
  if (exprs.length === 0) return null;
  if (exprs.length === 1) return exprs[0];
  return t.sequenceExpression([...exprs]);
}

/**
 * Try to coerce a list of statements to a single expression.
 *
 * Returns the folded expression when every input is an
 * {@link t.ExpressionStatement} (joined via sequence), and `null`
 * otherwise. Used by callers whose target slot requires an
 * expression (e.g. `while (<here>)`) to detect whether a clean
 * emission is possible before falling back to a structural wrapper
 * like `while (true) { ...; if (!cond) break; ... }`.
 */
export function statementsAsExpression(stmts: readonly t.Statement[]): t.Expression | null {
  const exprs: t.Expression[] = [];
  for (const stmt of stmts) {
    if (!t.isExpressionStatement(stmt)) return null;
    exprs.push(stmt.expression);
  }
  return toSequence(exprs);
}
