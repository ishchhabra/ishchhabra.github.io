import type { WhileStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { createOperationId, JumpTermOp, WhileTermOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";

/**
 * Lower `while (test) { body }` to a flat CFG with a
 * {@link WhileTermOp} header:
 *
 *   parentBlock --Jump--> headerBlock
 *   headerBlock (test ops) --WhileTermOp--> bodyBlock / exitBlock
 *   bodyBlock ... --Jump--> headerBlock   (back-edge)
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

  const headerBlock = environment.createBlock();
  const bodyBlock = environment.createBlock();
  const exitBlock = environment.createBlock();
  functionBuilder.addBlock(headerBlock);
  functionBuilder.addBlock(bodyBlock);
  functionBuilder.addBlock(exitBlock);

  parentBlock.setTerminal(new JumpTermOp(createOperationId(environment), headerBlock, []));

  // Header: evaluate test, terminate with WhileTermOp
  functionBuilder.currentBlock = headerBlock;
  const testPlace = buildNode(node.test, scope, functionBuilder, moduleBuilder, environment);
  if (testPlace === undefined || Array.isArray(testPlace)) {
    throw new Error("While statement test must be a single place");
  }
  headerBlock.setTerminal(new WhileTermOp(
    createOperationId(environment),
    testPlace,
    bodyBlock,
    exitBlock,
    "while",
    label,
  ));

  // Body
  functionBuilder.currentBlock = bodyBlock;
  functionBuilder.controlStack.push({
    kind: "loop",
    label,
    breakTarget: exitBlock.id,
    continueTarget: headerBlock.id,
    structured: false,
  });
  buildOwnedBody(node.body, scope, functionBuilder, moduleBuilder, environment);
  functionBuilder.controlStack.pop();
  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.setTerminal(new JumpTermOp(createOperationId(environment), headerBlock, []));
  }

  functionBuilder.currentBlock = exitBlock;
  return undefined;
}
