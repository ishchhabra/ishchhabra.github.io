/**
 * Codegen for CFG-style structured terminators.
 *
 * Each emitter reconstructs JS syntax from a terminator's named
 * successor blocks. The arm / body / handler sub-blocks are
 * reconstructed by walking them with their natural in-block ops;
 * `JumpTermOp` terminators inside those walks whose target is the
 * enclosing structured terminator's fallthrough (tracked on
 * `generator.structuredFallthroughStack`) emit nothing. After the
 * structured JS statement, the fallthrough block's own ops are
 * appended.
 */

import * as t from "@babel/types";
import {
  BranchTermOp,
  ForInTermOp,
  ForOfTermOp,
  ForTermOp,
  IfTermOp,
  JumpTermOp,
  LabeledTermOp,
  SwitchTermOp,
  TryTermOp,
  Value,
  WhileTermOp,
} from "../../../ir";
import type { BasicBlock } from "../../../ir/core/Block";
import { FuncOp } from "../../../ir/core/FuncOp";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBasicBlock, generateBlock } from "../generateBlock";
import { splitForUpdate, statementsAsExpression, toSequence } from "../normalize";
import { generateOp } from "../ops/generateOp";

// ---------------------------------------------------------------------
// IfTermOp
// ---------------------------------------------------------------------

export function generateIfTerm(
  term: IfTermOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const testNode = generator.values.get(term.cond.id);
  if (testNode === undefined) {
    throw new Error(`Value ${term.cond.id} not found for IfTermOp cond`);
  }
  t.assertExpression(testNode);

  const fallthrough = term.fallthroughBlock;
  const ternary = tryEmitTernary(term, testNode, fallthrough, generator);
  if (ternary !== null) {
    return withFallthrough(fallthrough, funcOp, generator, () => ternary);
  }

  return withFallthrough(fallthrough, funcOp, generator, () => {
    const thenStatements = emitArm(term.thenBlock, funcOp, generator);
    const elseStatements = emitArm(term.elseBlock, funcOp, generator);

    const elseNode = elseStatements.length > 0 ? t.blockStatement(elseStatements) : null;
    return [t.ifStatement(testNode, t.blockStatement(thenStatements), elseNode)];
  });
}

/**
 * If both arms are `jump fallthrough(X)` with fallthrough's single
 * block param used as a value downstream, emit a ternary and bind
 * to that param.
 */
function tryEmitTernary(
  term: IfTermOp,
  testNode: t.Expression,
  fallthrough: BasicBlock | null,
  generator: CodeGenerator,
): Array<t.Statement> | null {
  if (fallthrough === null) return null;
  if (fallthrough.params.length !== 1) return null;
  const thenArm = tryExtractArmYield(term.thenBlock, fallthrough);
  const elseArm = tryExtractArmYield(term.elseBlock, fallthrough);
  if (thenArm === null || elseArm === null) return null;
  const resultPlace = fallthrough.params[0];
  if (resultPlace.users.size === 0) return null;

  const thenValueNode = generator.values.get(thenArm.id);
  const elseValueNode = generator.values.get(elseArm.id);
  if (thenValueNode === undefined || elseValueNode === undefined) return null;
  t.assertExpression(thenValueNode);
  t.assertExpression(elseValueNode);

  generator.generatedBlocks.add(term.thenBlock.id);
  generator.generatedBlocks.add(term.elseBlock.id);

  const ternary = t.conditionalExpression(testNode, thenValueNode, elseValueNode);
  generator.values.set(resultPlace.id, ternary);
  return [];
}

function tryExtractArmYield(block: BasicBlock, fallthrough: BasicBlock): Value | null {
  if (block.operations.length > 0) return null;
  const terminal = block.terminal;
  if (!(terminal instanceof JumpTermOp)) return null;
  if (terminal.target !== fallthrough) return null;
  if (terminal.args.length !== 1) return null;
  return terminal.args[0];
}

// ---------------------------------------------------------------------
// WhileTermOp
// ---------------------------------------------------------------------

export function generateWhileTerm(
  term: WhileTermOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  // Host block (this terminator's own block) is the `continue` target.
  // Exit is the structured fallthrough.
  const hostBlock = term.parentBlock;
  return withFallthrough(term.exitBlock, funcOp, generator, () => {
    const savedControl = generator.controlStack.length;
    const testBlock = term.testBlock;
    if (hostBlock !== null) {
      generator.controlStack.push({
        kind: "loop",
        label: term.label,
        breakTarget: term.exitBlock.id,
        // `continue` in a do-while skips to the test (cond eval); for
        // a while loop, hostBlock is itself the test landing pad.
        continueTarget: term.kind === "do-while" ? testBlock.id : hostBlock.id,
        structured: false,
      });
    }

    const branch = testBlock.terminal;
    if (!(branch instanceof BranchTermOp)) {
      throw new Error(
        `WhileTermOp expected testBlock to end in BranchTermOp, got ${branch?.constructor.name}`,
      );
    }

    // Emission order:
    //  - while: test runs first per JS semantics; body may reference
    //    values the test defines (e.g. `while (depth--)` body reads
    //    the post-decrement value), so emit test first.
    //  - do-while: body runs first; test may reference body-defined
    //    values (e.g. `do { i++ } while (i < 10)`), and body's
    //    terminator JumpTermOp(testBlock) must be elided via the
    //    fallthrough stack so codegen falls through into the test
    //    naturally.
    let testStmts: Array<t.Statement> = [];
    let condNode: t.Expression | undefined;
    const emitTest = (): void => {
      if (!generator.generatedBlocks.has(testBlock.id)) {
        generator.generatedBlocks.add(testBlock.id);
      }
      for (const binding of testBlock.entryBindings) {
        if (!generator.values.has(binding.id)) generator.getPlaceIdentifier(binding);
      }
      for (const op of testBlock.operations) {
        testStmts.push(...generateOp(op, funcOp, generator));
      }
      const cond = generator.values.get(branch.cond.id);
      if (cond === undefined) {
        throw new Error(`Value ${branch.cond.id} not found for WhileTermOp cond`);
      }
      t.assertExpression(cond);
      condNode = cond;
    };

    let bodyStatements: Array<t.Statement>;
    if (term.kind === "do-while") {
      generator.structuredFallthroughStack.push(testBlock.id);
      bodyStatements = emitArm(term.bodyBlock, funcOp, generator);
      const popped = generator.structuredFallthroughStack.pop();
      if (popped !== testBlock.id) {
        throw new Error("structuredFallthroughStack corrupted (do-while body)");
      }
      emitTest();
    } else {
      emitTest();
      bodyStatements = emitArm(term.bodyBlock, funcOp, generator);
    }
    if (condNode === undefined) {
      throw new Error("WhileTermOp: cond not emitted");
    }

    // For do-while, the loop's back-edge goes from the test's true arm
    // to the hostBlock. SSAEliminator splits that critical edge into a
    // synthetic block holding the per-iteration phi copies. Inline its
    // ops into the test sequence so they run on each iteration before
    // the next body run. (For `while`, the equivalent copies live at
    // the end of bodyBlock and get emitted by the body walk above.)
    if (term.kind === "do-while" && hostBlock !== null && branch.trueTarget !== hostBlock) {
      const split = branch.trueTarget;
      const splitTerm = split.terminal;
      if (splitTerm instanceof JumpTermOp && splitTerm.target === hostBlock) {
        if (!generator.generatedBlocks.has(split.id)) {
          generator.generatedBlocks.add(split.id);
          for (const op of split.operations) {
            testStmts.push(...generateOp(op, funcOp, generator));
          }
        }
      }
    }

    generator.controlStack.length = savedControl;

    const { testExpression, hoistedDeclarations } = lowerTestStatements(testStmts, condNode);

    // For do-while, body executes inside its own block scope. If the
    // test expression (or any code emitted past the loop) references
    // `const $X = expr;` declarations in body, those bindings must be
    // hoisted to outer scope — JS block scoping makes body-scoped
    // `const`/`let` invisible in the `while (...)` clause.
    if (term.kind === "do-while") {
      hoistBodyDeclsReferencedByTest(bodyStatements, testExpression, hoistedDeclarations);
    }

    let loopStmt: t.Statement;
    if (term.kind === "do-while") {
      loopStmt = t.doWhileStatement(testExpression, t.blockStatement(bodyStatements));
    } else {
      loopStmt = t.whileStatement(testExpression, t.blockStatement(bodyStatements));
    }
    if (term.label !== undefined) {
      loopStmt = t.labeledStatement(t.identifier(term.label), loopStmt);
    }
    return [...hoistedDeclarations, loopStmt];
  });
}

/**
 * For do-while, walk top-level body statements looking for
 * `const X = expr;` / `let X = expr;` declarations whose name is
 * referenced inside the test expression. JS block scopes such
 * declarations to the body block, but the `while (...)` clause sits
 * outside it — so any test reference would ReferenceError. Rewrite
 * each such declarator to `X = expr;` and prepend a `let X;` to
 * hoistedDeclarations.
 */
function hoistBodyDeclsReferencedByTest(
  bodyStatements: t.Statement[],
  testExpression: t.Expression,
  hoistedDeclarations: t.Statement[],
): void {
  const referenced = collectReferencedIdentifiers(testExpression);
  if (referenced.size === 0) return;

  for (let i = 0; i < bodyStatements.length; i++) {
    const stmt = bodyStatements[i];
    if (!t.isVariableDeclaration(stmt)) continue;
    if (stmt.kind !== "const" && stmt.kind !== "let") continue;

    const keep: t.VariableDeclarator[] = [];
    const replacements: t.Statement[] = [];
    for (const decl of stmt.declarations) {
      if (!t.isIdentifier(decl.id) || !referenced.has(decl.id.name) || decl.init === null || decl.init === undefined) {
        keep.push(decl);
        continue;
      }
      hoistedDeclarations.push(
        t.variableDeclaration("let", [t.variableDeclarator(t.identifier(decl.id.name), null)]),
      );
      replacements.push(
        t.expressionStatement(
          t.assignmentExpression("=", t.identifier(decl.id.name), decl.init),
        ),
      );
    }

    if (replacements.length === 0) continue;
    if (keep.length > 0) {
      bodyStatements.splice(
        i,
        1,
        t.variableDeclaration(stmt.kind, keep),
        ...replacements,
      );
      i += replacements.length;
    } else {
      bodyStatements.splice(i, 1, ...replacements);
      i += replacements.length - 1;
    }
  }
}

function collectReferencedIdentifiers(node: t.Node): Set<string> {
  const names = new Set<string>();
  walkExpression(node, (n) => {
    if (t.isIdentifier(n)) names.add(n.name);
  });
  return names;
}

function walkExpression(node: t.Node, visit: (n: t.Node) => void): void {
  visit(node);
  for (const key of Object.keys(node) as Array<keyof t.Node>) {
    if (key === "loc" || key === "type") continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== null && typeof item === "object" && "type" in item) {
          walkExpression(item as t.Node, visit);
        }
      }
    } else if (value !== null && typeof value === "object" && "type" in (value as object)) {
      walkExpression(value as t.Node, visit);
    }
  }
}

/**
 * Lower a loop's test-block statements into a (testExpression,
 * hoistedDeclarations) pair. Each `let $x = expr;` in the test block
 * becomes a `let $x;` hoisted above the loop plus a `$x = expr`
 * comma-prepended into the test. Plain ExpressionStatements unwrap
 * and comma-prepend. Other shapes throw — ECMA §14.7.3 makes them
 * impossible in valid source; their presence indicates a pass-level
 * invariant violation.
 */
function lowerTestStatements(
  testStmts: Array<t.Statement>,
  condNode: t.Expression,
): { testExpression: t.Expression; hoistedDeclarations: t.Statement[] } {
  if (testStmts.length === 0) {
    return { testExpression: condNode, hoistedDeclarations: [] };
  }
  const asSeq = statementsAsExpression(testStmts);
  if (asSeq !== null) {
    return {
      testExpression: t.sequenceExpression([asSeq, condNode]),
      hoistedDeclarations: [],
    };
  }
  const { declarators, expressions, rejected } = splitForUpdate(testStmts);
  if (rejected.length > 0) {
    throw new Error(
      `Loop test block contains unsupported statement type(s): ${rejected
        .map((s) => s.type)
        .join(", ")}`,
    );
  }
  const hoistedDeclarations: t.Statement[] =
    declarators.length > 0 ? [t.variableDeclaration("let", declarators)] : [];
  const testExpression =
    expressions.length > 0
      ? t.sequenceExpression([...expressions, condNode])
      : condNode;
  return { testExpression, hoistedDeclarations };
}

// ---------------------------------------------------------------------
// ForTermOp
// ---------------------------------------------------------------------

export function generateForTerm(
  term: ForTermOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const hostBlock = term.parentBlock;
  return withFallthrough(term.exitBlock, funcOp, generator, () => {
    const savedControl = generator.controlStack.length;
    if (hostBlock !== null) {
      // Source break/continue: break → exit, continue → updateBlock
      // (native JS `for` semantics — `continue` runs the update clause
      // before re-testing).
      generator.controlStack.push({
        kind: "loop",
        label: term.label,
        breakTarget: term.exitBlock.id,
        continueTarget: term.updateBlock.id,
        structured: false,
      });
    }

    // Test block: emit non-terminator ops (populating generator.values
    // with the cond expression). BranchTermOp is read directly — not
    // emitted — so we can thread cond into the for-header's test slot.
    const testBlock = term.testBlock;
    if (!generator.generatedBlocks.has(testBlock.id)) {
      generator.generatedBlocks.add(testBlock.id);
    }
    for (const binding of testBlock.entryBindings) {
      if (!generator.values.has(binding.id)) generator.getPlaceIdentifier(binding);
    }
    const testStmts: Array<t.Statement> = [];
    for (const op of testBlock.operations) {
      testStmts.push(...generateOp(op, funcOp, generator));
    }
    const branch = testBlock.terminal;
    if (!(branch instanceof BranchTermOp)) {
      throw new Error(
        `ForTermOp expected testBlock to end in BranchTermOp, got ${branch?.constructor.name}`,
      );
    }
    const condNode = generator.values.get(branch.cond.id);
    if (condNode === undefined) {
      throw new Error(`Value ${branch.cond.id} not found for ForTermOp cond`);
    }
    t.assertExpression(condNode);

    // Body: Jump(updateBlock) becomes `continue;` via controlStack;
    // we strip the trailing one (natural end of body).
    const bodyStatements = emitArm(term.bodyBlock, funcOp, generator);
    generator.controlStack.length = savedControl;

    // Update block: emitted raw, then normalized into the for-header's
    // update slot via splitForUpdate. Declarations get hoisted into
    // the for-init's declarator list as bare declarators; their
    // initializers become assignment expressions threaded into the
    // update slot, comma-joined in emission order.
    let updateStmts: Array<t.Statement> = [];
    if (!generator.generatedBlocks.has(term.updateBlock.id)) {
      generator.generatedBlocks.add(term.updateBlock.id);
      generator.structuredFallthroughStack.push(term.testBlock.id);
      updateStmts = generateBasicBlock(term.updateBlock.id, funcOp, generator);
      const poppedUpdate = generator.structuredFallthroughStack.pop();
      if (poppedUpdate !== term.testBlock.id) {
        throw new Error("structuredFallthroughStack corrupted (for update)");
      }
    }

    stripTrailingUnlabelledContinue(bodyStatements);
    stripTrailingUnlabelledContinue(updateStmts);

    const updateSplit = splitForUpdate(updateStmts);
    if (updateSplit.rejected.length > 0) {
      throw new Error(
        `for-update block contains unsupported statement type(s): ${updateSplit.rejected
          .map((s) => s.type)
          .join(", ")}`,
      );
    }
    const { testExpression, hoistedDeclarations } = lowerTestStatements(testStmts, condNode);

    const initNode =
      updateSplit.declarators.length > 0
        ? t.variableDeclaration("let", updateSplit.declarators)
        : null;
    let loopStmt: t.Statement = t.forStatement(
      initNode,
      testExpression,
      toSequence(updateSplit.expressions),
      t.blockStatement(bodyStatements),
    );
    if (term.label !== undefined) {
      loopStmt = t.labeledStatement(t.identifier(term.label), loopStmt);
    }
    return [...hoistedDeclarations, loopStmt];
  });
}

function stripTrailingUnlabelledContinue(stmts: Array<t.Statement>): void {
  while (stmts.length > 0) {
    const last = stmts[stmts.length - 1];
    if (t.isContinueStatement(last) && !last.label) {
      stmts.pop();
      continue;
    }
    break;
  }
}

// ---------------------------------------------------------------------
// BranchTermOp
// ---------------------------------------------------------------------

/**
 * Generic two-way branch. Each arm's emission is delegated to a
 * synthetic `JumpTermOp` so break/continue/fallthrough semantics
 * handled by {@link generateJumpTerminal} apply uniformly.
 *
 * Shapes produced, depending on which arm resolves to an empty
 * statement list (fallthrough/no-op):
 *   - true empty, false non-empty → `if (!cond) falseStmts`
 *   - false empty, true non-empty → `if (cond) trueStmts`
 *   - both empty                  → no-op (both arms are fallthrough)
 *   - both non-empty              → `if (cond) {true} else {false}`
 */
export function generateBranchTerm(
  term: BranchTermOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const condNode = generator.values.get(term.cond.id);
  if (condNode === undefined) {
    throw new Error(`Value ${term.cond.id} not found for BranchTermOp cond`);
  }
  t.assertExpression(condNode);

  const trueStmts = emitTransfer(term.trueTarget, funcOp, generator);
  const falseStmts = emitTransfer(term.falseTarget, funcOp, generator);

  if (trueStmts.length === 0 && falseStmts.length === 0) {
    return [];
  }
  if (trueStmts.length === 0) {
    return [t.ifStatement(t.unaryExpression("!", condNode), unwrap(falseStmts))];
  }
  if (falseStmts.length === 0) {
    return [t.ifStatement(condNode, unwrap(trueStmts))];
  }
  return [
    t.ifStatement(condNode, t.blockStatement(trueStmts), t.blockStatement(falseStmts)),
  ];
}

function unwrap(stmts: Array<t.Statement>): t.Statement {
  if (stmts.length === 1) return stmts[0];
  return t.blockStatement(stmts);
}

function emitTransfer(
  target: BasicBlock,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  // Check break → continue → structured fallthrough, in that order.
  const breakLabel = generator.getBreakLabel(target.id);
  if (breakLabel !== undefined) {
    return [t.breakStatement(breakLabel ? t.identifier(breakLabel) : null)];
  }
  const continueLabel = generator.getContinueLabel(target.id);
  if (continueLabel !== undefined) {
    return [t.continueStatement(continueLabel ? t.identifier(continueLabel) : null)];
  }
  if (generator.structuredFallthroughStack.includes(target.id)) {
    return [];
  }
  return generateBlock(target.id, funcOp, generator);
}

// ---------------------------------------------------------------------
// ForOfTermOp / ForInTermOp
// ---------------------------------------------------------------------

export function generateForOfTerm(
  term: ForOfTermOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const iterNode = generator.values.get(term.iterable.id);
  if (iterNode === undefined) {
    throw new Error(`Value ${term.iterable.id} not found for ForOfTermOp iterable`);
  }
  t.assertExpression(iterNode);
  const iterValId = generator.getPlaceIdentifier(term.iterationValue);

  return withFallthrough(term.exitBlock, funcOp, generator, () => {
    const savedControl = generator.controlStack.length;
    const parentBlock = term.parentBlock;
    if (parentBlock !== null) {
      generator.controlStack.push({
        kind: "loop",
        label: term.label,
        breakTarget: term.exitBlock.id,
        continueTarget: parentBlock.id,
        structured: false,
      });
    }
    const bodyStatements = emitArm(term.bodyBlock, funcOp, generator);
    generator.controlStack.length = savedControl;

    const fos = t.forOfStatement(
      t.variableDeclaration("const", [t.variableDeclarator(iterValId)]),
      iterNode,
      t.blockStatement(bodyStatements),
      term.isAwait,
    );
    if (term.label !== undefined) {
      return [t.labeledStatement(t.identifier(term.label), fos)];
    }
    return [fos];
  });
}

export function generateForInTerm(
  term: ForInTermOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const objNode = generator.values.get(term.object.id);
  if (objNode === undefined) {
    throw new Error(`Value ${term.object.id} not found for ForInTermOp object`);
  }
  t.assertExpression(objNode);
  const iterValId = generator.getPlaceIdentifier(term.iterationValue);

  return withFallthrough(term.exitBlock, funcOp, generator, () => {
    const savedControl = generator.controlStack.length;
    const parentBlock = term.parentBlock;
    if (parentBlock !== null) {
      generator.controlStack.push({
        kind: "loop",
        label: term.label,
        breakTarget: term.exitBlock.id,
        continueTarget: parentBlock.id,
        structured: false,
      });
    }
    const bodyStatements = emitArm(term.bodyBlock, funcOp, generator);
    generator.controlStack.length = savedControl;

    const fis = t.forInStatement(
      t.variableDeclaration("const", [t.variableDeclarator(iterValId)]),
      objNode,
      t.blockStatement(bodyStatements),
    );
    if (term.label !== undefined) {
      return [t.labeledStatement(t.identifier(term.label), fis)];
    }
    return [fis];
  });
}

// ---------------------------------------------------------------------
// TryTermOp
// ---------------------------------------------------------------------

export function generateTryTerm(
  term: TryTermOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  return withFallthrough(term.fallthroughBlock, funcOp, generator, () => {
    // Body and handler each end in a JumpTermOp to the finally block
    // (when present) or directly to the fallthrough. Push the inner
    // fallthrough onto the structured stack so those Jumps emit
    // nothing — `withFallthroughOnly` is used rather than
    // `withFallthrough` because the block's content will land in a
    // different structural slot (the finalizer clause), not trailing
    // the arm.
    const innerFallthrough = term.finallyBlock ?? term.fallthroughBlock;
    const bodyStatements = withFallthroughOnly(innerFallthrough, generator, () =>
      emitArm(term.bodyBlock, funcOp, generator),
    );

    let handler: t.CatchClause | null = null;
    if (term.handlerBlock !== null) {
      const handlerStatements = withFallthroughOnly(innerFallthrough, generator, () =>
        emitArm(term.handlerBlock!, funcOp, generator),
      );
      const param =
        term.handlerParam !== null ? generator.getPlaceIdentifier(term.handlerParam) : null;
      handler = t.catchClause(param, t.blockStatement(handlerStatements));
    }

    let finalizer: t.BlockStatement | null = null;
    if (term.finallyBlock !== null) {
      const finallyStatements = emitArm(term.finallyBlock, funcOp, generator);
      finalizer = t.blockStatement(finallyStatements);
    }

    return [t.tryStatement(t.blockStatement(bodyStatements), handler, finalizer)];
  });
}

/**
 * Like {@link withFallthrough} but *doesn't* append the fallthrough
 * block's content after the emitted statements — only manages the
 * stack so jumps to the block become no-ops. Used when the block's
 * content will be emitted elsewhere (e.g. the try's finally clause,
 * a for-update slot).
 */
function withFallthroughOnly(
  block: BasicBlock | null,
  generator: CodeGenerator,
  emit: () => Array<t.Statement>,
): Array<t.Statement> {
  const id = block?.id;
  if (id !== undefined) generator.structuredFallthroughStack.push(id);
  try {
    return emit();
  } finally {
    if (id !== undefined) {
      const popped = generator.structuredFallthroughStack.pop();
      if (popped !== id) {
        throw new Error("structuredFallthroughStack corrupted");
      }
    }
  }
}

// ---------------------------------------------------------------------
// SwitchTermOp
// ---------------------------------------------------------------------

export function generateSwitchTerm(
  term: SwitchTermOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const discNode = generator.values.get(term.discriminant.id);
  if (discNode === undefined) {
    throw new Error(`Value ${term.discriminant.id} not found for SwitchTermOp disc`);
  }
  t.assertExpression(discNode);

  return withFallthrough(term.fallthroughBlock, funcOp, generator, () => {
    const savedControl = generator.controlStack.length;
    generator.controlStack.push({
      kind: "switch",
      label: term.label,
      breakTarget: term.fallthroughBlock.id,
      structured: false,
    });

    const cases: t.SwitchCase[] = [];
    for (const c of term.cases) {
      const testNode = generator.values.get(c.test.id);
      if (testNode === undefined) {
        throw new Error(`Value ${c.test.id} not found for SwitchTermOp case`);
      }
      t.assertExpression(testNode);
      const stmts = emitArm(c.block, funcOp, generator);
      cases.push(t.switchCase(testNode, stmts));
    }
    if (term.defaultBlock !== term.fallthroughBlock) {
      const stmts = emitArm(term.defaultBlock, funcOp, generator);
      cases.push(t.switchCase(null, stmts));
    }

    generator.controlStack.length = savedControl;
    const sw = t.switchStatement(discNode, cases);
    if (term.label !== undefined) {
      return [t.labeledStatement(t.identifier(term.label), sw)];
    }
    return [sw];
  });
}

// ---------------------------------------------------------------------
// LabeledTermOp
// ---------------------------------------------------------------------

export function generateLabeledTerm(
  term: LabeledTermOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  return withFallthrough(term.fallthroughBlock, funcOp, generator, () => {
    const savedControl = generator.controlStack.length;
    generator.controlStack.push({
      kind: "label",
      label: term.label,
      breakTarget: term.fallthroughBlock.id,
      structured: false,
    });
    const bodyStatements = emitArm(term.bodyBlock, funcOp, generator);
    generator.controlStack.length = savedControl;
    return [t.labeledStatement(t.identifier(term.label), t.blockStatement(bodyStatements))];
  });
}

// ---------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------

/**
 * Run `emit` with `fallthroughBlock.id` pushed onto the
 * `structuredFallthroughStack`. JumpTermOp inside the arm/body emission
 * whose target is this block will emit nothing. After `emit`
 * returns, we append the fallthrough block's own statements (if it
 * hasn't already been emitted elsewhere) so post-structure control
 * flow lands at top level.
 */
function withFallthrough(
  fallthroughBlock: BasicBlock | null,
  funcOp: FuncOp,
  generator: CodeGenerator,
  emit: () => Array<t.Statement>,
): Array<t.Statement> {
  const fallthroughId = fallthroughBlock?.id;
  if (fallthroughId !== undefined) {
    generator.structuredFallthroughStack.push(fallthroughId);
  }
  let statements: Array<t.Statement>;
  try {
    statements = emit();
  } finally {
    if (fallthroughId !== undefined) {
      const popped = generator.structuredFallthroughStack.pop();
      if (popped !== fallthroughId) {
        throw new Error("structuredFallthroughStack corrupted");
      }
    }
  }
  if (fallthroughBlock !== undefined && fallthroughBlock !== null) {
    // Emit fallthrough content once (memoized via generatedBlocks).
    if (!generator.generatedBlocks.has(fallthroughBlock.id)) {
      const post = generateBlock(fallthroughBlock.id, funcOp, generator);
      statements.push(...post);
    }
  }
  return statements;
}

function emitArm(block: BasicBlock, funcOp: FuncOp, generator: CodeGenerator): Array<t.Statement> {
  if (generator.generatedBlocks.has(block.id)) return [];
  generator.generatedBlocks.add(block.id);
  return generateBasicBlock(block.id, funcOp, generator);
}

/**
 * Common fallthrough of two arms. Walks each arm looking for a
 * terminating `JumpTermOp` to a shared target. Returns the shared
 * target block if found; null otherwise.
 */
function inferFallthrough(a: BasicBlock, b: BasicBlock): BasicBlock | null {
  const aTarget = trailingJumpTarget(a);
  const bTarget = trailingJumpTarget(b);
  if (aTarget !== null && aTarget === bTarget) return aTarget;
  return null;
}

function trailingJumpTarget(block: BasicBlock): BasicBlock | null {
  const term = block.terminal;
  if (term instanceof JumpTermOp) return term.target;
  return null;
}

export { generateBlock };
