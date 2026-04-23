import type { DoWhileStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { BranchTermOp, createOperationId, JumpTermOp, WhileTermOp } from "../../../ir";
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
 *   hostBlock   --WhileTermOp(do-while)--> testBlock / bodyBlock / exitBlock
 *   testBlock   (test ops) --BranchTermOp--> bodyBlock / exitBlock
 *   bodyBlock   --Jump-->      hostBlock    (back-edge)
 *
 * The first-iteration-runs-body-unconditionally semantics are
 * restored by codegen emitting `do { body } while (cond)` when it
 * sees `kind = "do-while"`. Dataflow is identical to a regular while.
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
  functionBuilder.addBlock(testBlock);
  functionBuilder.addBlock(bodyBlock);
  functionBuilder.addBlock(exitBlock);

  parentBlock.setTerminal(new JumpTermOp(createOperationId(environment), hostBlock, []));

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
    continueTarget: hostBlock.id,
    structured: false,
  });
  buildOwnedBody(node.body, scope, functionBuilder, moduleBuilder, environment);
  functionBuilder.controlStack.pop();
  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.setTerminal(new JumpTermOp(createOperationId(environment), hostBlock, []));
  }

  // Test block
  functionBuilder.currentBlock = testBlock;
  const testPlace = buildNode(node.test, scope, functionBuilder, moduleBuilder, environment);
  if (testPlace === undefined || Array.isArray(testPlace)) {
    throw new Error("Do-while statement test must be a single place");
  }
  functionBuilder.currentBlock.setTerminal(
    new BranchTermOp(createOperationId(environment), testPlace, bodyBlock, exitBlock),
  );

  functionBuilder.currentBlock = exitBlock;
  return undefined;
}
