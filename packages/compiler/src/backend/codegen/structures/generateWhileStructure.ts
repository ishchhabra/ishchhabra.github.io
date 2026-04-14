import * as t from "@babel/types";
import { ConditionOp, WhileOp } from "../../../ir";
import { FuncOp } from "../../../ir/core/FuncOp";
import { Region } from "../../../ir/core/Region";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBasicBlock } from "../generateBlock";

/**
 * Emit a `WhileOp` as `while (test) { ... }`. The test lives inside
 * `beforeRegion` and ends in a `ConditionOp` carrying the boolean
 * result. We walk the before region to compute the test's AST node
 * (via the deferred `generator.places` map), then read the condition
 * value and use it as the JS while-test.
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

  generator.controlStack.pop();

  const loopNode: t.Statement = t.whileStatement(testNode, t.blockStatement(bodyStatements));
  const labeled: t.Statement = structure.label
    ? t.labeledStatement(t.identifier(structure.label), loopNode)
    : loopNode;

  return [labeled];
}

/**
 * Walk a loop's before region, run codegen on its ops (so their AST
 * nodes are stored in `generator.places`), then read the
 * `ConditionOp`'s operand and return the JS expression node it
 * resolves to.
 *
 * Exported so {@link generateForStructure} can reuse it.
 */
export function computeConditionExpression(
  beforeRegion: Region,
  funcOp: FuncOp,
  generator: CodeGenerator,
): t.Expression {
  // Run codegen on the before block(s) for their side effect on
  // `generator.places`. Value ops in the test chain don't emit
  // statements (they store deferred AST nodes), so we just discard
  // the returned statements; the AST graph is built up in the
  // places map as we go.
  for (const block of beforeRegion.blocks) {
    generateBasicBlock(block.id, funcOp, generator);
  }

  // Find the ConditionOp at the end of the region.
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

  const testNode = generator.places.get(conditionOp.value.id);
  if (testNode === undefined) {
    throw new Error(`Place ${conditionOp.value.id} not found for loop condition`);
  }
  t.assertExpression(testNode);
  return testNode;
}
