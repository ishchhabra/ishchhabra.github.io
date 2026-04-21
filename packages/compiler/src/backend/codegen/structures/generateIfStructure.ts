import * as t from "@babel/types";
import { IfOp, StoreLocalOp, YieldOp } from "../../../ir";
import type { BasicBlock } from "../../../ir/core/Block";
import { FuncOp } from "../../../ir/core/FuncOp";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBasicBlock } from "../generateBlock";

/**
 * Emit a textbook MLIR `IfOp`. The op lives inline in its parent
 * block — emission produces only the `if (...) { ... }` statement
 * (or a ternary expression, when eligible). The parent block's
 * walker continues emitting subsequent ops after this returns.
 *
 * SSAEliminator has already lowered the op's SSA merge form:
 * `resultPlaces` are declared as `let` at function entry, and each
 * arm's YieldOp-feeding edge has been materialized as a
 * `StoreLocalOp(resultPlace, yieldValue, "assignment")` right
 * before the terminator. The codegen here just walks the region's
 * ops — including the SSA-inserted copy stores — and emits the
 * `if` statement. For the ternary fast path the copy stores are
 * ignored; the ternary expression is built directly from the
 * YieldOp's value operands and written into `generator.places` for
 * the IfOp's single result place.
 */
export function generateIfStructure(
  structure: IfOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const testNode = generator.values.get(structure.test.id);
  if (testNode === undefined) {
    throw new Error(`Value ${structure.test.id} not found for if test`);
  }
  t.assertExpression(testNode);

  const consEntry = structure.consequentRegion.entry;
  const altEntry = structure.alternateRegion?.entry;

  // Ternary path: 1 result + both arms pure single-block expressions.
  // If the sole result place is dead (DCE removed its only reader),
  // the ternary is being emitted for its side effects only — fall
  // through to the statement path, which doesn't deref yield values.
  if (
    structure.resultPlaces.length === 1 &&
    structure.resultPlaces[0].uses.size > 0 &&
    altEntry !== undefined &&
    isPureExpressionArm(consEntry, structure) &&
    isPureExpressionArm(altEntry, structure)
  ) {
    generateBasicBlock(consEntry.id, funcOp, generator);
    generateBasicBlock(altEntry.id, funcOp, generator);

    const consYield = consEntry.terminal as YieldOp;
    const altYield = altEntry.terminal as YieldOp;
    const consValue = generator.values.get(consYield.values[0].id);
    const altValue = generator.values.get(altYield.values[0].id);
    if (consValue === undefined) {
      throw new Error(`Value ${consYield.values[0].id} not found for if cons yield`);
    }
    if (altValue === undefined) {
      throw new Error(`Value ${altYield.values[0].id} not found for if alt yield`);
    }
    t.assertExpression(consValue);
    t.assertExpression(altValue);

    const ternaryNode = t.conditionalExpression(testNode, consValue, altValue);
    generator.values.set(structure.resultPlaces[0].id, ternaryNode);
    return [];
  }

  // Statement path: result places are already declared by
  // SSAEliminator; each arm's copy stores (also SSAEliminator-
  // inserted) are walked as ordinary ops. No codegen-level
  // declaration or store synthesis needed.
  for (const place of structure.resultPlaces) {
    generator.values.set(place.id, generator.getPlaceIdentifier(place));
  }

  const consequentStatements = generateBasicBlock(consEntry.id, funcOp, generator);
  const alternateStatements =
    altEntry !== undefined ? generateBasicBlock(altEntry.id, funcOp, generator) : undefined;

  // Emit `else { ... }` only when the alternate has visible
  // effects. The frontend always emits a synthetic alternate region
  // for MLIR CFG-completeness (so `getSuccessorRegions` can return a
  // symmetric graph), but a no-op alternate should codegen as no
  // `else` clause at all.
  const alternateNode =
    alternateStatements !== undefined && alternateStatements.length > 0
      ? t.blockStatement(alternateStatements)
      : null;

  const ifNode = t.ifStatement(testNode, t.blockStatement(consequentStatements), alternateNode);

  return [ifNode];
}

/**
 * Recognises arm shapes lowerable to a ternary arm: a single block
 * terminating in `YieldOp([value])` and containing only pure
 * expression ops. A single {@link StoreLocalOp} assigning to the
 * enclosing IfOp's result place is allowed — it's the SSA copy
 * store that SSAEliminator inserts on the yield-to-results edge,
 * and the ternary path intentionally bypasses it by reading the
 * YieldOp's value operand directly. Nested `IfOp` is allowed if it
 * is itself a ternary-eligible single-result expression.
 */
function isPureExpressionArm(block: BasicBlock, enclosingIf: IfOp): boolean {
  if (!(block.terminal instanceof YieldOp)) return false;
  if (block.terminal.values.length !== 1) return false;
  const resultDecls = new Set(enclosingIf.resultPlaces.map((p) => p.declarationId));
  for (const op of block.operations) {
    if (op instanceof IfOp) {
      if (op.resultPlaces.length !== 1) return false;
      const innerCons = op.consequentRegion.entry;
      const innerAlt = op.alternateRegion?.entry;
      if (innerAlt === undefined) return false;
      if (!isPureExpressionArm(innerCons, op)) return false;
      if (!isPureExpressionArm(innerAlt, op)) return false;
      continue;
    }
    if (
      op instanceof StoreLocalOp &&
      op.kind === "assignment" &&
      resultDecls.has(op.lval.declarationId)
    ) {
      continue;
    }
    const name = op.constructor.name;
    if (
      name === "StoreLocalOp" ||
      name === "StoreContextOp" ||
      name === "StoreMemberOp" ||
      name === "DeclareLocalOp" ||
      name === "DeclareContextOp" ||
      name === "FunctionDeclarationOp" ||
      name === "ClassDeclarationOp" ||
      name === "ExportDefaultDeclarationOp" ||
      name === "ExportNamedDeclarationOp" ||
      name === "ArrayDestructureOp" ||
      name === "ObjectDestructureOp" ||
      name === "WhileOp" ||
      name === "ForInOp" ||
      name === "ForOfOp" ||
      name === "BlockOp" ||
      name === "LabeledBlockOp" ||
      name === "SwitchOp" ||
      name === "TryOp"
    ) {
      return false;
    }
  }
  return true;
}
