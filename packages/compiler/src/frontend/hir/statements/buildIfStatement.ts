import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { BasicBlock, BranchTerminal, createInstructionId, JumpTerminal } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildIfStatement(
  node: ESTree.IfStatement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const testPlace = buildNode(node.test, scope, functionBuilder, moduleBuilder, environment);
  if (testPlace === undefined || Array.isArray(testPlace)) {
    throw new Error("If statement test must be a single place");
  }

  const currentBlock = functionBuilder.currentBlock;

  // Create the join block.
  const joinBlock = environment.createBlock();
  functionBuilder.blocks.set(joinBlock.id, joinBlock);

  // Build the consequent block
  const consequentBlock = environment.createBlock();
  functionBuilder.blocks.set(consequentBlock.id, consequentBlock);

  functionBuilder.currentBlock = consequentBlock;
  buildNode(node.consequent, scope, functionBuilder, moduleBuilder, environment);

  // After building the consequent block, we need to set the terminal
  // from the last block to the join block, unless the block already has
  // a terminal (e.g., a return statement).
  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.terminal = new JumpTerminal(
      createInstructionId(functionBuilder.environment),
      joinBlock.id,
    );
  }

  // Build the alternate block
  let alternateBlock: BasicBlock | undefined = joinBlock;
  if (node.alternate != null) {
    alternateBlock = environment.createBlock();
    functionBuilder.blocks.set(alternateBlock.id, alternateBlock);

    functionBuilder.currentBlock = alternateBlock;
    buildNode(node.alternate, scope, functionBuilder, moduleBuilder, environment);
  }

  // After building the alternate block, we need to set the terminal
  // from the last block to the join block, unless the block already has
  // a terminal (e.g., a return statement).
  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.terminal = new JumpTerminal(
      createInstructionId(functionBuilder.environment),
      joinBlock.id,
    );
  }

  // Set branch terminal for the current block.
  currentBlock.terminal = new BranchTerminal(
    createInstructionId(functionBuilder.environment),
    testPlace,
    consequentBlock.id,
    alternateBlock.id,
    joinBlock.id,
  );

  functionBuilder.currentBlock = joinBlock;
  return undefined;
}
