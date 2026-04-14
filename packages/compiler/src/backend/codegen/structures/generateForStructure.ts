import * as t from "@babel/types";
import { ForOp } from "../../../ir";
import { FuncOp } from "../../../ir/core/FuncOp";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBasicBlock } from "../generateBlock";
import { computeConditionExpression } from "./generateWhileStructure";

/**
 * Emit a JS `for (; test; update) { body }` for a {@link ForOp}.
 * The init expression / declarations live in the parent block before
 * the ForOp; codegen for those happens inline as the parent block is
 * walked, so we don't emit an init clause here.
 *
 * The before region computes the test (via {@link computeConditionExpression}),
 * the body region emits the loop body, and the update region's ops
 * are collapsed into a single comma-expression for the JS for-clause.
 * If the source omitted the update, the update region contains only
 * a `YieldOp`, the collapse returns `undefined`, and we still emit
 * the for-statement (with no update clause).
 */
export function generateForStructure(
  structure: ForOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  generator.controlStack.push({
    kind: "loop",
    label: structure.label,
    breakTarget: undefined,
    continueTarget: undefined,
  });

  const testNode = computeConditionExpression(
    structure.beforeRegion,
    funcOp,
    generator,
  );

  const bodyStatements = generateBasicBlock(
    structure.bodyRegion.entry.id,
    funcOp,
    generator,
  );

  const updateStatements = generateBasicBlock(
    structure.updateRegion.entry.id,
    funcOp,
    generator,
  );
  const updateExpression = collapseUpdateStatements(updateStatements);

  generator.controlStack.pop();

  // When the update region collapses to nothing (the source omitted
  // the update clause, or every op in it was DCE'd away), emit a
  // `while (test) { body }` instead of `for (; test; ) { body }`.
  // The two are observationally identical and `while` is the more
  // idiomatic JS surface form.
  const loopNode: t.Statement =
    updateExpression !== undefined
      ? t.forStatement(null, testNode, updateExpression, t.blockStatement(bodyStatements))
      : t.whileStatement(testNode, t.blockStatement(bodyStatements));
  const labeled: t.Statement = structure.label
    ? t.labeledStatement(t.identifier(structure.label), loopNode)
    : loopNode;

  return [labeled];
}

/**
 * Collapse a list of expression statements from the update region
 * into a single comma-separated expression for the `for` loop's
 * update clause. If the list is empty (only a YieldOp was emitted),
 * return `undefined`.
 */
function collapseUpdateStatements(
  statements: readonly t.Statement[],
): t.Expression | undefined {
  const exprs: t.Expression[] = [];
  for (const stmt of statements) {
    if (t.isExpressionStatement(stmt)) {
      exprs.push(stmt.expression);
    }
  }
  if (exprs.length === 0) return undefined;
  if (exprs.length === 1) return exprs[0];
  return t.sequenceExpression(exprs);
}
