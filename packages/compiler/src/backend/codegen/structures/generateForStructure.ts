import * as t from "@babel/types";
import { ForOp } from "../../../ir";
import { FuncOp } from "../../../ir/core/FuncOp";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBasicBlock } from "../generateBlock";
import { computeConditionExpression } from "./generateWhileStructure";

/**
 * Emit a `ForOp` as a JS `for (init; test; update) body`.
 *
 * Per ECMA §14.7.4 the four slots have three distinct AST-level
 * shapes: init is `[Expression] | var VariableDeclarationList |
 * LexicalDeclaration`, test and update are `[Expression]`. No legal
 * JS source produces anything else in any slot.
 *
 * The IR carries each slot as its own region on the ForOp. Codegen
 * walks each region, converts its emitted statements into the
 * corresponding AST shape, and fits the result into the JS for
 * syntax. VariableDeclarations that `SSAEliminator` inserted into
 * the update region (to preserve pre-mutation SSA values past a
 * later store) are merged into the init slot's declarator list;
 * each in-update initializer becomes a plain AssignmentExpression
 * that fits in the update clause. This is the normalization Closure
 * Compiler applies.
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

  const initStatements = generateBasicBlock(structure.initRegion.entry.id, funcOp, generator);
  const testNode = computeConditionExpression(structure.beforeRegion, funcOp, generator);
  const bodyStatements = generateBasicBlock(structure.bodyRegion.entry.id, funcOp, generator);
  const updateStatements = generateBasicBlock(structure.updateRegion.entry.id, funcOp, generator);

  generator.controlStack.pop();

  const { updateExpression, hoistedDeclarators, hoistedAssignments } =
    lowerUpdateRegion(updateStatements);

  const { initNode, hoistedInitStatements } = lowerInitRegion(initStatements, hoistedDeclarators);
  const updateWithHoistedAssignments = prependAssignments(hoistedAssignments, updateExpression);

  const loopNode: t.Statement = t.forStatement(
    initNode,
    testNode,
    updateWithHoistedAssignments,
    t.blockStatement(bodyStatements),
  );
  const labeled: t.Statement = structure.label
    ? t.labeledStatement(t.identifier(structure.label), loopNode)
    : loopNode;

  // When SSAEliminator inserts iter-arg copy stores alongside
  // source-level declarations in the init region, the init slot
  // cannot express both shapes. Emit the declarations (plus their
  // copy stores, if any) as prepended statements above the
  // for-statement, preserving the let/const block-scope by wrapping
  // both in a block.
  if (hoistedInitStatements.length > 0) {
    return [t.blockStatement([...hoistedInitStatements, labeled])];
  }

  return [labeled];
}

/**
 * Walk the init region's emitted statements and collect them into a
 * single for-init AST node. The init slot accepts only one of three
 * shapes (per the grammar); we pick based on what's present:
 *
 *   - All VariableDeclarations with a consistent kind → merge their
 *     declarators into one VariableDeclaration, then append any
 *     hoisted declarators from the update region.
 *   - All ExpressionStatements → comma-join into a single Expression.
 *   - Empty → the init slot becomes `null`, with any hoisted update
 *     declarators emitted as a standalone `let` that becomes the
 *     init slot.
 *
 * Throws on mixed shapes or on unsupported statement types. A mixed
 * init region shouldn't arise from legal source and isn't produced
 * by any current pass.
 */
function lowerInitRegion(
  initStatements: readonly t.Statement[],
  hoistedDeclarators: readonly t.VariableDeclarator[],
): {
  initNode: t.VariableDeclaration | t.Expression | null;
  /**
   * Statements that must be emitted **before** the for-statement,
   * inside an enclosing block. Populated when the init region has
   * both source-level declarations and iter-arg copy stores emitted
   * by SSAEliminator — JS grammar forbids mixing the two in a single
   * init slot.
   */
  hoistedInitStatements: readonly t.Statement[];
} {
  const declarations: t.VariableDeclaration[] = [];
  const expressions: t.Expression[] = [];

  for (const stmt of initStatements) {
    if (t.isVariableDeclaration(stmt)) {
      declarations.push(stmt);
      continue;
    }
    if (t.isExpressionStatement(stmt)) {
      expressions.push(stmt.expression);
      continue;
    }
    throw new Error(
      `generateForStructure: unsupported statement type ${stmt.type} in for-init region.`,
    );
  }

  // Mixed shape — source-level decls AND SSA-eliminator iter-arg
  // copy stores coexist in the init region. Hoist both (decls and
  // their trailing copies) above the for-statement; the caller wraps
  // in a block to preserve let/const block-scope.
  if (declarations.length > 0 && expressions.length > 0) {
    const hoistedInitStatements: t.Statement[] = [...declarations];
    for (const expr of expressions) {
      hoistedInitStatements.push(t.expressionStatement(expr));
    }
    const initNode: t.VariableDeclaration | null =
      hoistedDeclarators.length > 0 ? t.variableDeclaration("let", [...hoistedDeclarators]) : null;
    return { initNode, hoistedInitStatements };
  }

  if (declarations.length > 0) {
    const declarators: t.VariableDeclarator[] = [];
    let declKind: "var" | "let" | "const" | undefined;
    for (const decl of declarations) {
      if (declKind === undefined) {
        declKind = decl.kind as "var" | "let" | "const";
      } else if (declKind !== decl.kind) {
        throw new Error(
          `generateForStructure: mixed declaration kinds in for-init ` +
            `(${declKind} vs ${decl.kind}). Source-level JS can't produce this.`,
        );
      }
      declarators.push(...decl.declarations);
    }
    declarators.push(...hoistedDeclarators);
    return {
      initNode: t.variableDeclaration(declKind ?? "let", declarators),
      hoistedInitStatements: [],
    };
  }

  if (hoistedDeclarators.length > 0) {
    if (expressions.length > 0) {
      throw new Error(
        `generateForStructure: cannot combine an expression-init with ` +
          `hoisted declarators from the update region. Update handling if this fires.`,
      );
    }
    return {
      initNode: t.variableDeclaration("let", [...hoistedDeclarators]),
      hoistedInitStatements: [],
    };
  }

  if (expressions.length === 0) {
    return { initNode: null, hoistedInitStatements: [] };
  }
  if (expressions.length === 1) {
    return { initNode: expressions[0], hoistedInitStatements: [] };
  }
  return { initNode: t.sequenceExpression(expressions), hoistedInitStatements: [] };
}

/**
 * Walk the update region's emitted statements and split them into:
 *
 *   - `hoistedDeclarators` — each synthesized `const $x = v` from the
 *     update region becomes a bare `$x` declarator (no initializer)
 *     appended to the init slot's declarator list.
 *   - `hoistedAssignments` — each such declaration's initializer `v`
 *     becomes `$x = v`, prepended to the update expression so it runs
 *     once per iteration like the original.
 *   - `updateExpression` — the remaining ExpressionStatements
 *     comma-joined into a single Expression.
 */
function lowerUpdateRegion(statements: readonly t.Statement[]): {
  updateExpression: t.Expression | undefined;
  hoistedDeclarators: t.VariableDeclarator[];
  hoistedAssignments: t.Expression[];
} {
  const exprs: t.Expression[] = [];
  const hoistedDeclarators: t.VariableDeclarator[] = [];
  const hoistedAssignments: t.Expression[] = [];

  for (const stmt of statements) {
    if (t.isExpressionStatement(stmt)) {
      exprs.push(stmt.expression);
      continue;
    }
    if (t.isVariableDeclaration(stmt)) {
      for (const decl of stmt.declarations) {
        if (!t.isIdentifier(decl.id)) {
          throw new Error(
            `generateForStructure: cannot hoist VariableDeclaration with non-identifier id ` +
              `(${decl.id.type}) out of for-update clause.`,
          );
        }
        hoistedDeclarators.push(t.variableDeclarator(t.identifier(decl.id.name)));
        if (decl.init) {
          hoistedAssignments.push(
            t.assignmentExpression("=", t.identifier(decl.id.name), decl.init),
          );
        }
      }
      continue;
    }
    throw new Error(
      `generateForStructure: unsupported statement type ${stmt.type} in for-update region. ` +
        `ECMA §14.7.4 types the update slot as an Expression, so this should not arise from ` +
        `legal JS source; a pass has produced an unexpected op shape here.`,
    );
  }

  let updateExpression: t.Expression | undefined;
  if (exprs.length === 1) {
    updateExpression = exprs[0];
  } else if (exprs.length > 1) {
    updateExpression = t.sequenceExpression(exprs);
  }
  return { updateExpression, hoistedDeclarators, hoistedAssignments };
}

function prependAssignments(
  assignments: readonly t.Expression[],
  update: t.Expression | undefined,
): t.Expression | undefined {
  if (assignments.length === 0) return update;
  const combined = update === undefined ? [...assignments] : [...assignments, update];
  if (combined.length === 1) return combined[0];
  return t.sequenceExpression(combined);
}
