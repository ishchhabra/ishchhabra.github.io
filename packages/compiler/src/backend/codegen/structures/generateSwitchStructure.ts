import * as t from "@babel/types";
import { BreakOp, SwitchOp } from "../../../ir";
import { FuncOp } from "../../../ir/core/FuncOp";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBlock } from "../generateBlock";

/**
 * Emit a textbook MLIR `SwitchOp` as a JS `switch (...) { ... }`
 * statement. Each case has its own region; we emit each case's
 * body then append a `break` so the cases don't fall through (our
 * frontend desugars fall-through by appending statements).
 */
export function generateSwitchStructure(
  structure: SwitchOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const discriminantNode = generator.values.get(structure.discriminant.id);
  if (discriminantNode === undefined) {
    throw new Error(`Value ${structure.discriminant.id} not found for switch discriminant`);
  }
  t.assertExpression(discriminantNode);

  const label = structure.label;
  generator.controlStack.push({
    kind: "switch",
    label,
    breakTarget: undefined,
  });

  const switchCases: t.SwitchCase[] = [];
  for (let i = 0; i < structure.regions.length; i++) {
    const region = structure.regions[i];
    const test = structure.caseTests[i];

    let testNode: t.Expression | null = null;
    if (test !== null) {
      const node = generator.values.get(test.id);
      if (node === undefined) {
        throw new Error(`Value ${test.id} not found for switch case test`);
      }
      t.assertExpression(node);
      testNode = node;
    }

    // Walk every block in the case region in program order. The
    // entry block is always emitted first; any block reached by
    // jump-chaining from the entry is already cached via
    // `generatedBlocks` and is skipped. Blocks in the region that
    // the entry doesn't reach by jump chain still get emitted here,
    // preserving all code in the case.
    const caseStatements: t.Statement[] = [];
    for (const block of region.blocks) {
      if (generator.generatedBlocks.has(block.id)) continue;
      caseStatements.push(...generateBlock(block.id, funcOp, generator));
    }
    // Strip a trailing `break` — it's the YieldOp terminator, not a
    // source-level break. Keep explicit source breaks (BreakOp).
    const last = region.blocks[region.blocks.length - 1];
    if (last.terminal && !(last.terminal instanceof BreakOp)) {
      // YieldOp emits nothing; append a break to separate the case
      // from the next one.
      caseStatements.push(t.breakStatement());
    }
    switchCases.push(t.switchCase(testNode, caseStatements));
  }

  generator.controlStack.pop();

  const switchStatement: t.Statement = t.switchStatement(discriminantNode, switchCases);
  if (label) {
    return [t.labeledStatement(t.identifier(label), switchStatement)];
  }
  return [switchStatement];
}
