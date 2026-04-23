import type { WhileStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { BranchTermOp, createOperationId, JumpTermOp, WhileTermOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";

/**
 * Lower `while (test) { body }` to a flat CFG:
 *
 *   parentBlock --Jump-->      hostBlock (empty landing pad)
 *   hostBlock   --WhileTermOp--> testBlock / bodyBlock / exitBlock
 *   testBlock   (test ops) --BranchTermOp--> bodyBlock / exitBlock
 *   bodyBlock   --Jump-->      hostBlock    (back-edge; `continue`)
 *
 * `continue` targets the hostBlock (control then passes to testBlock
 * via WhileTermOp); `break` targets the exitBlock.
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
    new WhileTermOp(createOperationId(environment), testBlock, bodyBlock, exitBlock, "while", label),
  );

  // Test block: evaluate cond, branch.
  functionBuilder.currentBlock = testBlock;
  const testPlace = buildNode(node.test, scope, functionBuilder, moduleBuilder, environment);
  if (testPlace === undefined || Array.isArray(testPlace)) {
    throw new Error("While statement test must be a single place");
  }
  functionBuilder.currentBlock.setTerminal(
    new BranchTermOp(createOperationId(environment), testPlace, bodyBlock, exitBlock),
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

  functionBuilder.currentBlock = exitBlock;
  return undefined;
}
