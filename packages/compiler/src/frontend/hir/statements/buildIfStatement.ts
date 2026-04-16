import type { IfStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { createOperationId, IfOp, Region, YieldOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";

/**
 * Lower a JS `if (test) { … } [else { … }]` to a textbook MLIR
 * `IfOp`. The IfOp is inlined into its parent block; after it,
 * control continues with the next op in the parent block.
 *
 *   parentBlock: [...ops before..., IfOp, ...ops after...]
 *     consRegion: [consBlock] ending in YieldOp
 *     altRegion:  [altBlock]  ending in YieldOp (two-arm only)
 *
 * No fallthrough / join block. No header JumpOp. The SSABuilder
 * lifts any let-variable mutations inside the arms into
 * `IfOp.resultPlaces` and threads the new values through each arm's
 * `YieldOp.values`, so reads in the parent block's subsequent ops
 * pick up the merged values.
 */
export function buildIfStatement(
  node: IfStatement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const parentBlock = functionBuilder.currentBlock;

  const testPlace = buildNode(node.test, scope, functionBuilder, moduleBuilder, environment);
  if (testPlace === undefined || Array.isArray(testPlace)) {
    throw new Error("If statement test must be a single place");
  }

  // Build the consequent region.
  const consequentRegion = new Region([]);
  const consequentBlock = environment.createBlock();
  functionBuilder.withStructureRegion(consequentRegion, () => {
    functionBuilder.addBlock(consequentBlock);
    functionBuilder.currentBlock = consequentBlock;
    buildOwnedBody(node.consequent, scope, functionBuilder, moduleBuilder, environment);
    if (functionBuilder.currentBlock.terminal === undefined) {
      functionBuilder.currentBlock.terminal = new YieldOp(createOperationId(environment), []);
    }
  });

  // Build the alternate region (two-arm only).
  let alternateRegion: Region | undefined;
  if (node.alternate != null) {
    alternateRegion = new Region([]);
    const alternateBlock = environment.createBlock();
    functionBuilder.withStructureRegion(alternateRegion, () => {
      functionBuilder.addBlock(alternateBlock);
      functionBuilder.currentBlock = alternateBlock;
      buildOwnedBody(node.alternate!, scope, functionBuilder, moduleBuilder, environment);
      if (functionBuilder.currentBlock.terminal === undefined) {
        functionBuilder.currentBlock.terminal = new YieldOp(createOperationId(environment), []);
      }
    });
  }

  const ifOp = new IfOp(
    createOperationId(environment),
    testPlace,
    [],
    consequentRegion,
    alternateRegion,
  );
  parentBlock.appendOp(ifOp);
  functionBuilder.currentBlock = parentBlock;
  return undefined;
}
