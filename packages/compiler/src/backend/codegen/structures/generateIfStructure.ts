import * as t from "@babel/types";
import { IfOp, YieldOp } from "../../../ir";
import type { BasicBlock } from "../../../ir/core/Block";
import { FuncOp } from "../../../ir/core/FuncOp";
import type { Region } from "../../../ir/core/Region";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBasicBlock } from "../generateBlock";

/**
 * Emit a textbook MLIR `IfOp`. The op lives inline in its parent
 * block — emission produces only the `if (...) { ... }` statement
 * (or a ternary expression, when eligible). The parent block's
 * walker continues emitting subsequent ops after this returns.
 */
export function generateIfStructure(
  structure: IfOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const testNode = generator.places.get(structure.test.id);
  if (testNode === undefined) {
    throw new Error(`Place ${structure.test.id} not found for if test`);
  }
  t.assertExpression(testNode);

  const consEntry = structure.consequentRegion.entry;
  const altEntry = structure.alternateRegion?.entry;

  // Ternary path: 1 result + both arms pure single-block expressions.
  if (
    structure.resultPlaces.length === 1 &&
    altEntry !== undefined &&
    isPureExpressionArm(consEntry) &&
    isPureExpressionArm(altEntry)
  ) {
    generateBasicBlock(consEntry.id, funcOp, generator);
    generateBasicBlock(altEntry.id, funcOp, generator);

    const consYield = consEntry.terminal as YieldOp;
    const altYield = altEntry.terminal as YieldOp;
    const consValue = generator.places.get(consYield.values[0].id);
    const altValue = generator.places.get(altYield.values[0].id);
    if (consValue === undefined) {
      throw new Error(`Place ${consYield.values[0].id} not found for if cons yield`);
    }
    if (altValue === undefined) {
      throw new Error(`Place ${altYield.values[0].id} not found for if alt yield`);
    }
    t.assertExpression(consValue);
    t.assertExpression(altValue);

    const ternaryNode = t.conditionalExpression(testNode, consValue, altValue);
    generator.places.set(structure.resultPlaces[0].id, ternaryNode);
    return [];
  }

  // Statement path: emit let bindings for each result place, then
  // the if/else statement. Each arm ends with assignments from its
  // YieldOp's values into the result places.
  const resultDeclarations: t.Statement[] = [];
  for (const place of structure.resultPlaces) {
    const name = generator.getPlaceIdentifier(place);
    resultDeclarations.push(
      t.variableDeclaration("let", [t.variableDeclarator(name, t.identifier("undefined"))]),
    );
    generator.places.set(place.id, name);
  }

  const consequentStatements = generateBasicBlock(consEntry.id, funcOp, generator);
  appendYieldStores(structure.consequentRegion, structure, consequentStatements, generator);

  let alternateStatements: t.Statement[] | undefined;
  if (altEntry !== undefined) {
    alternateStatements = generateBasicBlock(altEntry.id, funcOp, generator);
    appendYieldStores(structure.alternateRegion!, structure, alternateStatements, generator);
  }

  const ifNode = t.ifStatement(
    testNode,
    t.blockStatement(consequentStatements),
    alternateStatements !== undefined ? t.blockStatement(alternateStatements) : null,
  );

  return [...resultDeclarations, ifNode];
}

/**
 * Append assignment statements to the end of `statements` that write
 * the arm's YieldOp values into the IfOp's result places.
 */
function appendYieldStores(
  region: Region,
  op: IfOp,
  statements: t.Statement[],
  generator: CodeGenerator,
): void {
  let yieldOp: YieldOp | undefined;
  for (const block of region.blocks) {
    if (block.terminal instanceof YieldOp) {
      yieldOp = block.terminal;
      break;
    }
  }
  if (yieldOp === undefined) return;
  for (let i = 0; i < op.resultPlaces.length; i++) {
    const resultPlace = op.resultPlaces[i];
    const valuePlace = yieldOp.values[i];
    if (valuePlace === undefined) continue;
    const resultIdent = generator.getPlaceIdentifier(resultPlace);
    const valueNode = generator.places.get(valuePlace.id);
    if (valueNode === undefined) continue;
    t.assertExpression(valueNode);
    statements.push(t.expressionStatement(t.assignmentExpression("=", resultIdent, valueNode)));
  }
}

/**
 * Recognises arm shapes lowerable to a ternary arm: a single block
 * terminating in `YieldOp([value])` and containing only pure
 * expression ops. Nested `IfOp` is allowed if it is itself a
 * ternary-eligible single-result expression.
 */
function isPureExpressionArm(block: BasicBlock): boolean {
  if (!(block.terminal instanceof YieldOp)) return false;
  if (block.terminal.values.length !== 1) return false;
  for (const op of block.operations) {
    if (op instanceof IfOp) {
      if (op.resultPlaces.length !== 1) return false;
      const innerCons = op.consequentRegion.entry;
      const innerAlt = op.alternateRegion?.entry;
      if (innerAlt === undefined) return false;
      if (!isPureExpressionArm(innerCons)) return false;
      if (!isPureExpressionArm(innerAlt)) return false;
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
