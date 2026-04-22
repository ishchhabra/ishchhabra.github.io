/**
 * Codegen for CFG-style structured terminators.
 *
 * Each emitter reconstructs JS syntax from a terminator's named
 * successor blocks. Successor blocks are marked as generated (via
 * `generateBlock`'s existing memoization on `generator.generatedBlocks`)
 * so the outer function-level walker doesn't re-emit them.
 */

import * as t from "@babel/types";
import {
  ForInTerm,
  ForOfTerm,
  ForTerm,
  IfTerm,
  JumpOp,
  LabeledTerm,
  SwitchTerm,
  TryTerm,
  Value,
  WhileTerm,
} from "../../../ir";
import type { BasicBlock } from "../../../ir/core/Block";
import { FuncOp } from "../../../ir/core/FuncOp";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBasicBlock, generateBlock } from "../generateBlock";

// ---------------------------------------------------------------------
// IfTerm
// ---------------------------------------------------------------------

export function generateIfTerm(
  term: IfTerm,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const testNode = generator.values.get(term.cond.id);
  if (testNode === undefined) {
    throw new Error(`Value ${term.cond.id} not found for IfTerm cond`);
  }
  t.assertExpression(testNode);

  const thenBlock = term.thenBlock;
  const elseBlock = term.elseBlock;

  // Look for a ternary-emission opportunity: both arms are simple
  // single-terminator blocks that jump to a common fallthrough with
  // one block-arg, and that fallthrough's block-arg has uses.
  const ternary = tryEmitTernary(term, testNode, funcOp, generator);
  if (ternary !== null) return ternary;

  const thenStatements = generateBasicBlockWithoutReemit(thenBlock, funcOp, generator);
  const elseStatements = generateBasicBlockWithoutReemit(elseBlock, funcOp, generator);

  const elseNode = elseStatements.length > 0 ? t.blockStatement(elseStatements) : null;
  const ifNode = t.ifStatement(testNode, t.blockStatement(thenStatements), elseNode);

  return [ifNode];
}

/**
 * If both arms are `jump join(X)` with join's single block param
 * used as a value downstream, emit `testNode ? thenVal : elseVal` and
 * bind the ternary to the join block's param.
 */
function tryEmitTernary(
  term: IfTerm,
  testNode: t.Expression,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> | null {
  const thenArm = tryExtractArmYield(term.thenBlock);
  const elseArm = tryExtractArmYield(term.elseBlock);
  if (thenArm === null || elseArm === null) return null;
  if (thenArm.target !== elseArm.target) return null;
  const joinBlock = thenArm.target;
  if (joinBlock.params.length !== 1) return null;
  const resultPlace = joinBlock.params[0];
  if (resultPlace.uses.size === 0) return null;

  // Emit sub-expressions that produce the ternary arms.
  const thenValueNode = generator.values.get(thenArm.value.id);
  const elseValueNode = generator.values.get(elseArm.value.id);
  if (thenValueNode === undefined || elseValueNode === undefined) return null;
  t.assertExpression(thenValueNode);
  t.assertExpression(elseValueNode);

  // Mark both arm blocks as generated (no-op content).
  generator.generatedBlocks.add(term.thenBlock.id);
  generator.generatedBlocks.add(term.elseBlock.id);

  const ternary = t.conditionalExpression(testNode, thenValueNode, elseValueNode);
  generator.values.set(resultPlace.id, ternary);

  // Don't emit a statement for the ternary — the result is bound to
  // the join block's param; callers of that param will see the
  // expression.
  return [];
}

function tryExtractArmYield(
  block: BasicBlock,
): { target: BasicBlock; value: Value } | null {
  // Arm must consist only of a single JumpOp terminator with one arg.
  if (block.operations.length > 0) return null;
  const terminal = block.terminal;
  if (!(terminal instanceof JumpOp)) return null;
  if (terminal.args.length !== 1) return null;
  return { target: terminal.target, value: terminal.args[0] };
}

// ---------------------------------------------------------------------
// WhileTerm
// ---------------------------------------------------------------------

export function generateWhileTerm(
  term: WhileTerm,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const testNode = generator.values.get(term.cond.id);
  if (testNode === undefined) {
    throw new Error(`Value ${term.cond.id} not found for WhileTerm cond`);
  }
  t.assertExpression(testNode);

  const bodyStatements = generateBasicBlockWithoutReemit(term.bodyBlock, funcOp, generator);

  if (term.kind === "do-while") {
    return [t.doWhileStatement(testNode, t.blockStatement(bodyStatements))];
  }
  return [t.whileStatement(testNode, t.blockStatement(bodyStatements))];
}

// ---------------------------------------------------------------------
// ForTerm
// ---------------------------------------------------------------------

export function generateForTerm(
  term: ForTerm,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const testNode = generator.values.get(term.cond.id);
  if (testNode === undefined) {
    throw new Error(`Value ${term.cond.id} not found for ForTerm cond`);
  }
  t.assertExpression(testNode);

  const bodyStatements = generateBasicBlockWithoutReemit(term.bodyBlock, funcOp, generator);
  // Mark update block as consumed; its ops become the update expr
  // via its own emission in a real rewrite. For now just the body.
  generator.generatedBlocks.add(term.updateBlock.id);

  return [t.forStatement(null, testNode, null, t.blockStatement(bodyStatements))];
}

// ---------------------------------------------------------------------
// ForOfTerm / ForInTerm
// ---------------------------------------------------------------------

export function generateForOfTerm(
  term: ForOfTerm,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const iterNode = generator.values.get(term.iterable.id);
  if (iterNode === undefined) {
    throw new Error(`Value ${term.iterable.id} not found for ForOfTerm iterable`);
  }
  t.assertExpression(iterNode);
  const iterValId = generator.getPlaceIdentifier(term.iterationValue);
  const bodyStatements = generateBasicBlockWithoutReemit(term.bodyBlock, funcOp, generator);

  return [
    t.forOfStatement(
      t.variableDeclaration("const", [t.variableDeclarator(iterValId)]),
      iterNode,
      t.blockStatement(bodyStatements),
      term.isAwait,
    ),
  ];
}

export function generateForInTerm(
  term: ForInTerm,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const objNode = generator.values.get(term.object.id);
  if (objNode === undefined) {
    throw new Error(`Value ${term.object.id} not found for ForInTerm object`);
  }
  t.assertExpression(objNode);
  const iterValId = generator.getPlaceIdentifier(term.iterationValue);
  const bodyStatements = generateBasicBlockWithoutReemit(term.bodyBlock, funcOp, generator);

  return [
    t.forInStatement(
      t.variableDeclaration("const", [t.variableDeclarator(iterValId)]),
      objNode,
      t.blockStatement(bodyStatements),
    ),
  ];
}

// ---------------------------------------------------------------------
// TryTerm
// ---------------------------------------------------------------------

export function generateTryTerm(
  term: TryTerm,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const bodyStatements = generateBasicBlockWithoutReemit(term.bodyBlock, funcOp, generator);

  let handler: t.CatchClause | null = null;
  if (term.handlerBlock !== null) {
    const handlerStatements = generateBasicBlockWithoutReemit(
      term.handlerBlock,
      funcOp,
      generator,
    );
    const param =
      term.handlerParam !== null ? generator.getPlaceIdentifier(term.handlerParam) : null;
    handler = t.catchClause(param, t.blockStatement(handlerStatements));
  }

  let finalizer: t.BlockStatement | null = null;
  if (term.finallyBlock !== null) {
    const finallyStatements = generateBasicBlockWithoutReemit(
      term.finallyBlock,
      funcOp,
      generator,
    );
    finalizer = t.blockStatement(finallyStatements);
  }

  return [t.tryStatement(t.blockStatement(bodyStatements), handler, finalizer)];
}

// ---------------------------------------------------------------------
// SwitchTerm
// ---------------------------------------------------------------------

export function generateSwitchTerm(
  term: SwitchTerm,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const discNode = generator.values.get(term.discriminant.id);
  if (discNode === undefined) {
    throw new Error(`Value ${term.discriminant.id} not found for SwitchTerm disc`);
  }
  t.assertExpression(discNode);

  const cases: t.SwitchCase[] = [];
  for (const c of term.cases) {
    const testNode = generator.values.get(c.test.id);
    if (testNode === undefined) {
      throw new Error(`Value ${c.test.id} not found for SwitchTerm case`);
    }
    t.assertExpression(testNode);
    const stmts = generateBasicBlockWithoutReemit(c.block, funcOp, generator);
    cases.push(t.switchCase(testNode, stmts));
  }
  if (term.defaultBlock !== term.fallthroughBlock) {
    const stmts = generateBasicBlockWithoutReemit(term.defaultBlock, funcOp, generator);
    cases.push(t.switchCase(null, stmts));
  }

  return [t.switchStatement(discNode, cases)];
}

// ---------------------------------------------------------------------
// LabeledTerm
// ---------------------------------------------------------------------

export function generateLabeledTerm(
  term: LabeledTerm,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const bodyStatements = generateBasicBlockWithoutReemit(term.bodyBlock, funcOp, generator);
  return [
    t.labeledStatement(t.identifier(term.label), t.blockStatement(bodyStatements)),
  ];
}

// ---------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------

/**
 * Emit the given block's statements, marking it as generated so the
 * outer function walker won't re-emit it at top level.
 */
function generateBasicBlockWithoutReemit(
  block: BasicBlock,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  if (generator.generatedBlocks.has(block.id)) return [];
  generator.generatedBlocks.add(block.id);
  return generateBasicBlock(block.id, funcOp, generator);
}

// Re-export `generateBlock` so callers of this module can keep going
// through the memoized path when needed.
export { generateBlock };
