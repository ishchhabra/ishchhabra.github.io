import * as t from "@babel/types";
import { ConditionOp, WhileOp } from "../../../ir";
import { FuncOp } from "../../../ir/core/FuncOp";
import { Region } from "../../../ir/core/Region";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBasicBlock } from "../generateBlock";

/**
 * Emit a `WhileOp` as `while (test) body`.
 *
 * ECMA §14.7.3 types the while-test slot as a single `Expression`.
 * Our `beforeRegion` may contain ops whose codegen emits
 * VariableDeclarations (snapshot bindings inserted by
 * `SSAEliminator`) or ExpressionStatements (side effects in a test
 * like `while (++i < n)` or `while (f() && g())`). To keep the
 * idiomatic while-shape we:
 *
 *   1. Walk `beforeRegion`'s ops for their codegen side effects
 *      (AST registration in `generator.places`).
 *   2. Split the emitted statements into **hoisted declarations**
 *      (to land as `let $x;` before the loop) and **prelude
 *      expressions** (to comma-prepend into the test).
 *   3. Read the test expression from the `ConditionOp`'s operand.
 *   4. Assemble final test: `(p1, p2, ..., testExpr)` if any
 *      prelude is present, else just `testExpr`.
 *
 * Declarations are hoisted rather than dropped; the original
 * `const $x = v` becomes `let $x;` before the loop plus `$x = v`
 * inside the test's comma. Same normalization we apply to
 * for-updates. Never drops IR — ECMA §14.7.3 makes non-Expression
 * non-Declaration content in the test slot syntactically
 * impossible, so any shape we didn't handle would be a pass-level
 * invariant violation; we throw in that case.
 */
export function generateWhileStructure(
  structure: WhileOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  generator.controlStack.push({
    kind: "loop",
    label: structure.label,
    breakTarget: undefined,
    continueTarget: undefined,
  });

  const { testExpression, hoistedDeclarations } = lowerBeforeRegion(
    structure.beforeRegion,
    funcOp,
    generator,
  );

  const bodyStatements = generateBasicBlock(structure.bodyRegion.entry.id, funcOp, generator);

  generator.controlStack.pop();

  const loopNode: t.Statement = t.whileStatement(testExpression, t.blockStatement(bodyStatements));
  const labeled: t.Statement = structure.label
    ? t.labeledStatement(t.identifier(structure.label), loopNode)
    : loopNode;

  return [...hoistedDeclarations, labeled];
}

/**
 * Walk a loop's before region, run codegen on its ops (so their AST
 * nodes are stored in `generator.places`), then read the
 * `ConditionOp`'s operand and return the JS expression node it
 * resolves to — with any side-effecting prelude statements
 * comma-prepended and declarations hoisted out.
 *
 * Exported so {@link generateForStructure} can reuse it for the
 * for-test slot.
 */
export function computeConditionExpression(
  beforeRegion: Region,
  funcOp: FuncOp,
  generator: CodeGenerator,
): t.Expression {
  const { testExpression } = lowerBeforeRegion(beforeRegion, funcOp, generator);
  return testExpression;
}

/**
 * Low-level helper: walk `beforeRegion`, codegen its ops, split the
 * emitted statements into hoisted declarations vs prelude
 * expressions, assemble the final test expression.
 *
 * Note: callers that ignore the returned `hoistedDeclarations` will
 * drop them — only the while / for top-level emitters should invoke
 * this directly. `computeConditionExpression` exists as a
 * convenience for the common no-hoists path; if the region contains
 * declarations it throws there (covered by the throw in
 * {@link splitBeforeStatements}).
 */
function lowerBeforeRegion(
  beforeRegion: Region,
  funcOp: FuncOp,
  generator: CodeGenerator,
): {
  testExpression: t.Expression;
  hoistedDeclarations: t.Statement[];
} {
  // Run codegen on the before region's block(s). Ops that emit
  // value nodes into `generator.places` don't produce standalone
  // statements; the rest do.
  const emittedStatements: t.Statement[] = [];
  for (const block of beforeRegion.blocks) {
    emittedStatements.push(...generateBasicBlock(block.id, funcOp, generator));
  }

  let conditionOp: ConditionOp | undefined;
  for (const block of beforeRegion.blocks) {
    if (block.terminal instanceof ConditionOp) {
      conditionOp = block.terminal;
      break;
    }
  }
  if (conditionOp === undefined) {
    throw new Error("Loop before region must terminate in ConditionOp");
  }

  const testNode = generator.values.get(conditionOp.value.id);
  if (testNode === undefined) {
    throw new Error(`Value ${conditionOp.value.id} not found for loop condition`);
  }
  t.assertExpression(testNode);

  const { hoistedDeclarations, preludeExpressions } = splitBeforeStatements(emittedStatements);

  const testExpression: t.Expression =
    preludeExpressions.length === 0
      ? testNode
      : t.sequenceExpression([...preludeExpressions, testNode]);

  return { testExpression, hoistedDeclarations };
}

/**
 * Separate the before region's emitted AST into parts that fit in
 * JS while/for grammar:
 *
 *   - `VariableDeclaration` → hoist a bare `let $x;` before the
 *     loop, rewrite the initializer as `$x = v` prepended into the
 *     test via comma.
 *   - `ExpressionStatement` → unwrap, its expression goes into the
 *     test-prelude.
 *   - Anything else → throw. ECMA §14.7.3 makes it grammatically
 *     impossible for valid JS source to put a non-expression
 *     non-declaration in a test position, so this must be an
 *     internal IR invariant violation.
 */
function splitBeforeStatements(statements: readonly t.Statement[]): {
  hoistedDeclarations: t.Statement[];
  preludeExpressions: t.Expression[];
} {
  const hoistedDeclarations: t.Statement[] = [];
  const preludeExpressions: t.Expression[] = [];

  for (const stmt of statements) {
    if (t.isExpressionStatement(stmt)) {
      preludeExpressions.push(stmt.expression);
      continue;
    }
    if (t.isVariableDeclaration(stmt)) {
      for (const decl of stmt.declarations) {
        if (!t.isIdentifier(decl.id)) {
          throw new Error(
            `generateWhileStructure: cannot hoist VariableDeclaration with non-identifier id ` +
              `(${decl.id.type}) out of while-test.`,
          );
        }
        hoistedDeclarations.push(
          t.variableDeclaration("let", [t.variableDeclarator(t.identifier(decl.id.name))]),
        );
        if (decl.init) {
          preludeExpressions.push(
            t.assignmentExpression("=", t.identifier(decl.id.name), decl.init),
          );
        }
      }
      continue;
    }
    throw new Error(
      `generateWhileStructure: unsupported statement type ${stmt.type} in while-test region. ` +
        `ECMA §14.7.3 types the test slot as an Expression; a pass has produced an ` +
        `unexpected op shape here.`,
    );
  }

  return { hoistedDeclarations, preludeExpressions };
}
