import type { DoWhileStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { createOperationId, JumpOp, WhileTerm } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";

/**
 * Lower `do { body } while (test)` to flat CFG with a WhileTerm
 * header and `kind = "do-while"`. The body runs first; the header
 * re-enters on truthy test, exits on falsey.
 *
 *   parentBlock  --Jump-->   bodyBlock    (first iteration skips test)
 *   bodyBlock    --Jump-->   headerBlock
 *   headerBlock (test ops) --WhileTerm(do-while)--> bodyBlock / exitBlock
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

  const bodyBlock = environment.createBlock();
  const headerBlock = environment.createBlock();
  const exitBlock = environment.createBlock();
  functionBuilder.addBlock(bodyBlock);
  functionBuilder.addBlock(headerBlock);
  functionBuilder.addBlock(exitBlock);

  // For do-while, CFG enters at header (same as while). The
  // WhileTerm's `kind: "do-while"` tells codegen to emit
  // `do { body } while (cond)`, whose JS runtime runs body first
  // even though the CFG header's cond check happens first at the
  // IR level. Dataflow is identical; codegen preserves source
  // semantics.
  parentBlock.setTerminal(new JumpOp(createOperationId(environment), headerBlock, []));

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
    functionBuilder.currentBlock.setTerminal(new JumpOp(createOperationId(environment), headerBlock, []));
  }

  // Header: test + branch
  functionBuilder.currentBlock = headerBlock;
  const testPlace = buildNode(node.test, scope, functionBuilder, moduleBuilder, environment);
  if (testPlace === undefined || Array.isArray(testPlace)) {
    throw new Error("Do-while statement test must be a single place");
  }
  headerBlock.setTerminal(new WhileTerm(
    createOperationId(environment),
    testPlace,
    bodyBlock,
    exitBlock,
    "do-while",
    label,
  ));

  functionBuilder.currentBlock = exitBlock;
  return undefined;
}
