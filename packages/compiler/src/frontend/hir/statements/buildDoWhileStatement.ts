import type { DoWhileStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import {
  BranchTermOp,
  createOperationId,
  JumpTermOp,
  valueBlockTarget,
  WhileTermOp,
} from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";

/**
 * Lower `do { body } while (test)` to flat CFG with a
 * {@link WhileTermOp} host block and `kind = "do-while"`.
 *
 *   parentBlock --Jump-->      hostBlock
 *   hostBlock   --WhileTermOp(do-while, successor=bodyBlock)--> bodyBlock
 *   bodyBlock   --Jump-->      testBlock
 *   testBlock   (test ops) --BranchTermOp--> hostBlock / exitBlock
 *
 * Body precedes test in the CFG cycle, matching `do-while` execution
 * order: each iteration runs body first, then test. The host block
 * carries loop-carried values via its block params (driven by the
 * parent on initial entry and by the back-edge from the test on
 * subsequent iterations); body reads them through host. Codegen
 * emits `do { body } while (cond)` when it sees `kind = "do-while"`.
 */
export function buildDoWhileStatement(
  node: DoWhileStatement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const parentBlock = functionBuilder.currentBlock;

  const hostBlock = environment.createBlock();
  const testBlock = environment.createBlock();
  const bodyBlock = environment.createBlock();
  const exitBlock = environment.createBlock();
  functionBuilder.addBlock(hostBlock);
  functionBuilder.addBlock(bodyBlock);
  functionBuilder.addBlock(testBlock);
  functionBuilder.addBlock(exitBlock);

  parentBlock.setTerminal(
    new JumpTermOp(createOperationId(environment), valueBlockTarget(hostBlock)),
  );

  hostBlock.setTerminal(
    new WhileTermOp(
      createOperationId(environment),
      testBlock,
      bodyBlock,
      exitBlock,
      "do-while",
      label,
    ),
  );

  // Body
  functionBuilder.currentBlock = bodyBlock;
  functionBuilder.controlStack.push({
    kind: "loop",
    label,
    breakTarget: exitBlock.id,
    continueTarget: testBlock.id,
    structured: false,
  });
  buildOwnedBody(node.body, scope, functionBuilder, moduleBuilder, environment);
  functionBuilder.controlStack.pop();
  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.setTerminal(
      new JumpTermOp(createOperationId(environment), valueBlockTarget(testBlock)),
    );
  }

  // Test block
  functionBuilder.currentBlock = testBlock;
  const testPlace = buildNode(node.test, scope, functionBuilder, moduleBuilder, environment);
  if (testPlace === undefined || Array.isArray(testPlace)) {
    throw new Error("Do-while statement test must be a single place");
  }
  functionBuilder.currentBlock.setTerminal(
    new BranchTermOp(
      createOperationId(environment),
      testPlace,
      valueBlockTarget(hostBlock),
      valueBlockTarget(exitBlock),
    ),
  );

  functionBuilder.currentBlock = exitBlock;
  return undefined;
}
