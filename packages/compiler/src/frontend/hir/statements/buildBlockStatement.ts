import type { BlockStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { BlockOp, createOperationId, Region, YieldOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";

/**
 * Lower a JS `{ ... }` block statement to a textbook MLIR `BlockOp`.
 *
 *   parentBlock: [...ops before..., BlockOp, ...ops after...]
 *     BlockOp.bodyRegion: [bodyBlock]
 *       bodyBlock: [...body ops..., YieldOp]
 *
 * The BlockOp is inline in the parent block — nothing else to do.
 * After the BlockOp, the parent block's walker continues with the
 * next op naturally.
 */
export function buildBlockStatement(
  node: BlockStatement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const parentBlock = functionBuilder.currentBlock;

  const bodyRegion = new Region([]);
  const bodyBlock = environment.createBlock();
  functionBuilder.withStructureRegion(bodyRegion, () => {
    functionBuilder.addBlock(bodyBlock);
    functionBuilder.currentBlock = bodyBlock;
    buildOwnedBody(node, scope, functionBuilder, moduleBuilder, environment);
    if (functionBuilder.currentBlock.terminal === undefined) {
      functionBuilder.currentBlock.terminal = new YieldOp(
        createOperationId(environment),
        [],
      );
    }
  });

  const blockOp = new BlockOp(createOperationId(environment), bodyRegion);
  parentBlock.appendOp(blockOp);
  functionBuilder.currentBlock = parentBlock;
  return undefined;
}
