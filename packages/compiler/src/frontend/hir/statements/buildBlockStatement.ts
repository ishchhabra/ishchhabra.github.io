import type { BlockStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { createOperationId, JumpOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";

/**
 * Lower `{ ... }` to flat CFG: the block body inlines into a
 * successor block with a jump to a fallthrough block. No structured
 * op.
 */
export function buildBlockStatement(
  node: BlockStatement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const parentBlock = functionBuilder.currentBlock;

  const bodyBlock = environment.createBlock();
  const fallthroughBlock = environment.createBlock();
  functionBuilder.addBlock(bodyBlock);
  functionBuilder.addBlock(fallthroughBlock);

  parentBlock.terminal = new JumpOp(createOperationId(environment), bodyBlock, []);

  functionBuilder.currentBlock = bodyBlock;
  buildOwnedBody(node, scope, functionBuilder, moduleBuilder, environment);
  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.terminal = new JumpOp(createOperationId(environment), fallthroughBlock, []);
  }

  functionBuilder.currentBlock = fallthroughBlock;
  return undefined;
}
