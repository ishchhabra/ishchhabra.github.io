import type { IfStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { createOperationId, IfTerm, JumpOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";

/**
 * Lower `if (test) { … } [else { … }]` to a flat CFG with an
 * {@link IfTerm} terminator:
 *
 *   parentBlock --IfTerm--> consBlock / altBlock
 *   consBlock   --Jump-->  fallthroughBlock
 *   altBlock    --Jump-->  fallthroughBlock
 *
 * Both arms always exist — the frontend synthesizes an empty
 * alternate that jumps straight to fallthrough when there's no
 * source `else`. Loop-carried / merged let values flow via block
 * parameters on the fallthrough block (standard CFG SSA).
 */
export function buildIfStatement(
  node: IfStatement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  // Build the test FIRST — compound conditions (`a && b`, `a || b`,
  // `a ?? b`, ternaries) internally create blocks and leave
  // `currentBlock` on the logical-expression's join block. The IfTerm
  // must be placed on wherever the test finished computing, not on
  // the block we started in.
  const testPlace = buildNode(node.test, scope, functionBuilder, moduleBuilder, environment);
  if (testPlace === undefined || Array.isArray(testPlace)) {
    throw new Error("If statement test must be a single place");
  }
  const parentBlock = functionBuilder.currentBlock;

  const consequentBlock = environment.createBlock();
  const alternateBlock = environment.createBlock();
  const fallthroughBlock = environment.createBlock();
  functionBuilder.addBlock(consequentBlock);
  functionBuilder.addBlock(alternateBlock);
  functionBuilder.addBlock(fallthroughBlock);

  parentBlock.setTerminal(new IfTerm(createOperationId(environment), testPlace, consequentBlock, alternateBlock, fallthroughBlock));

  // Consequent arm
  functionBuilder.currentBlock = consequentBlock;
  buildOwnedBody(node.consequent, scope, functionBuilder, moduleBuilder, environment);
  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.setTerminal(new JumpOp(createOperationId(environment), fallthroughBlock, []));
  }

  // Alternate arm
  functionBuilder.currentBlock = alternateBlock;
  if (node.alternate != null) {
    buildOwnedBody(node.alternate, scope, functionBuilder, moduleBuilder, environment);
  }
  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.setTerminal(new JumpOp(createOperationId(environment), fallthroughBlock, []));
  }

  functionBuilder.currentBlock = fallthroughBlock;
  return undefined;
}
