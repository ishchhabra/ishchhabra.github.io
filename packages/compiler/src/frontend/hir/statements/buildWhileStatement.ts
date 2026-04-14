import type { WhileStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { ConditionOp, createOperationId, Region, WhileOp, YieldOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";

/**
 * Lower a JS `while (test) { body }` to a textbook MLIR `WhileOp`.
 *
 *   parentBlock: [..., WhileOp, ...]
 *     WhileOp.beforeRegion: [beforeBlock]
 *       beforeBlock: [...test ops..., ConditionOp(test_result)]
 *     WhileOp.bodyRegion: [bodyBlock]
 *       bodyBlock: [...body ops..., YieldOp]
 *
 * The test lives inside `beforeRegion` instead of as a flat operand
 * to the WhileOp. The before region is re-entered on every iteration,
 * which is what gives the test "evaluates per iteration" semantics at
 * the IR level — matching MLIR's `scf.while`.
 */
export function buildWhileStatement(
  node: WhileStatement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const parentBlock = functionBuilder.currentBlock;

  // Before region: test ops + ConditionOp terminator.
  const beforeRegion = new Region([]);
  const beforeBlock = environment.createBlock();
  let testPlace;
  functionBuilder.withStructureRegion(beforeRegion, () => {
    functionBuilder.addBlock(beforeBlock);
    functionBuilder.currentBlock = beforeBlock;
    testPlace = buildNode(node.test, scope, functionBuilder, moduleBuilder, environment);
    if (testPlace === undefined || Array.isArray(testPlace)) {
      throw new Error("While statement test must be a single place");
    }
    functionBuilder.currentBlock.terminal = new ConditionOp(
      createOperationId(environment),
      testPlace,
    );
  });

  // Body region: the loop body, terminated in YieldOp on natural
  // fall-through (or in BreakOp / ContinueOp / ReturnOp).
  const bodyRegion = new Region([]);
  const bodyBlock = environment.createBlock();
  functionBuilder.withStructureRegion(bodyRegion, () => {
    functionBuilder.addBlock(bodyBlock);
    functionBuilder.currentBlock = bodyBlock;
    functionBuilder.controlStack.push({
      kind: "loop",
      label,
      breakTarget: undefined,
      continueTarget: undefined,
      structured: true,
    });
    buildOwnedBody(node.body, scope, functionBuilder, moduleBuilder, environment);
    functionBuilder.controlStack.pop();
    if (functionBuilder.currentBlock.terminal === undefined) {
      functionBuilder.currentBlock.terminal = new YieldOp(
        createOperationId(environment),
        [],
      );
    }
  });

  const whileOp = new WhileOp(
    createOperationId(environment),
    beforeRegion,
    bodyRegion,
    label,
  );
  parentBlock.appendOp(whileOp);
  functionBuilder.currentBlock = parentBlock;
  return undefined;
}
