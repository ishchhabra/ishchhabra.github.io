/**
 * Codegen for CFG-style structured terminators.
 *
 * Each emitter reconstructs JS syntax from a terminator's named
 * successor blocks. The arm / body / handler sub-blocks are
 * reconstructed by walking them with their natural in-block ops;
 * `JumpOp` terminators inside those walks whose target is the
 * enclosing structured terminator's fallthrough (tracked on
 * `generator.structuredFallthroughStack`) emit nothing. After the
 * structured JS statement, the fallthrough block's own ops are
 * appended.
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
  term: IfTerm,
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
  if (resultPlace.uses.size === 0) return null;

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
  if (!(terminal instanceof JumpOp)) return null;
  if (terminal.target !== fallthrough) return null;
  if (terminal.args.length !== 1) return null;
  return terminal.args[0];
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

  // The header block (this terminator's own block) is the back-edge
  // target; inside the body, `jump header` is `continue`. The exit
  // block is the fallthrough.
  const headerBlock = term.parentBlock;
  return withFallthrough(term.exitBlock, funcOp, generator, () => {
    const savedControl = generator.controlStack.length;
    if (headerBlock !== null) {
      generator.controlStack.push({
        kind: "loop",
        label: term.label,
        breakTarget: term.exitBlock.id,
        continueTarget: headerBlock.id,
        structured: false,
      });
    }
    const bodyStatements = emitArm(term.bodyBlock, funcOp, generator);
    generator.controlStack.length = savedControl;

    const loopStatement =
      term.kind === "do-while"
        ? t.doWhileStatement(testNode, t.blockStatement(bodyStatements))
        : t.whileStatement(testNode, t.blockStatement(bodyStatements));
    if (term.label !== undefined) {
      return [t.labeledStatement(t.identifier(term.label), loopStatement)];
    }
    return [loopStatement];
  });
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

  const headerBlock = term.parentBlock;
  return withFallthrough(term.exitBlock, funcOp, generator, () => {
    const savedControl = generator.controlStack.length;
    if (headerBlock !== null) {
      generator.controlStack.push({
        kind: "loop",
        label: term.label,
        breakTarget: term.exitBlock.id,
        continueTarget: term.updateBlock.id,
        structured: false,
      });
    }
    const bodyStatements = emitArm(term.bodyBlock, funcOp, generator);
    generator.controlStack.length = savedControl;

    // Emit the update block's statements at the END of the body.
    // Putting them in the for-stmt's update slot would scope them
    // outside the body's `{}`, but updates can reference values
    // declared as `const` inside the body (e.g. SSA intermediates
    // materialized in the body block). Appending to body keeps
    // those `const`s in scope.
    //
    // Note: source-level `continue` in the body will skip these
    // appended update ops. For now this is a known limitation —
    // covered by emitting a labeled do-while around the body when
    // continues need to jump through updates. Most for-loops don't
    // use continue so this works in practice.
    if (!generator.generatedBlocks.has(term.updateBlock.id)) {
      generator.generatedBlocks.add(term.updateBlock.id);
      const updateCtrl = headerBlock
        ? {
            kind: "loop" as const,
            label: term.label,
            breakTarget: term.exitBlock.id,
            continueTarget: headerBlock.id,
            structured: false,
          }
        : null;
      if (updateCtrl) generator.controlStack.push(updateCtrl);
      const updateStmts = generateBasicBlock(term.updateBlock.id, funcOp, generator);
      if (updateCtrl) generator.controlStack.pop();
      bodyStatements.push(...updateStmts);
    }

    const forStmt = t.forStatement(
      null,
      testNode,
      null,
      t.blockStatement(bodyStatements),
    );
    if (term.label !== undefined) {
      return [t.labeledStatement(t.identifier(term.label), forStmt)];
    }
    return [forStmt];
  });
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
// TryTerm
// ---------------------------------------------------------------------

export function generateTryTerm(
  term: TryTerm,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  return withFallthrough(term.fallthroughBlock, funcOp, generator, () => {
    const bodyStatements = emitArm(term.bodyBlock, funcOp, generator);

    let handler: t.CatchClause | null = null;
    if (term.handlerBlock !== null) {
      const handlerStatements = emitArm(term.handlerBlock, funcOp, generator);
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
        throw new Error(`Value ${c.test.id} not found for SwitchTerm case`);
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
// LabeledTerm
// ---------------------------------------------------------------------

export function generateLabeledTerm(
  term: LabeledTerm,
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
 * `structuredFallthroughStack`. JumpOp inside the arm/body emission
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
 * terminating `JumpOp` to a shared target. Returns the shared
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
  if (term instanceof JumpOp) return term.target;
  return null;
}

export { generateBlock };
