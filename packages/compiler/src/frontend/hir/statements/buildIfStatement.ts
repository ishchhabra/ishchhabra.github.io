import type * as AST from "../../estree";
import { Environment } from "../../../environment";
import { BasicBlock, BranchTerminal, createInstructionId, JumpTerminal } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";

export function buildIfStatement(
  node: AST.IfStatement,
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
  const scopeId = functionBuilder.lexicalScopeIdFor(scope);

  // Create the join block.
  const joinBlock = environment.createBlock(scopeId);
  functionBuilder.blocks.set(joinBlock.id, joinBlock);

  // Build the consequent block. When the consequent is a BlockStatement,
  // use its scope so it merges with the consequent block — if/else syntax
  // provides { }.
  const consequentScope =
    node.consequent.type === "BlockStatement" ? functionBuilder.scopeFor(node.consequent) : scope;
  const consequentScopeId = functionBuilder.lexicalScopeIdFor(consequentScope);
  const consequentBlock = environment.createBlock(consequentScopeId);
  functionBuilder.blocks.set(consequentBlock.id, consequentBlock);

  functionBuilder.currentBlock = consequentBlock;
  buildOwnedBody(node.consequent, scope, functionBuilder, moduleBuilder, environment);

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
    const alternateScope =
      node.alternate?.type === "BlockStatement" ? functionBuilder.scopeFor(node.alternate) : scope;
    const alternateScopeId = functionBuilder.lexicalScopeIdFor(alternateScope);
    alternateBlock = environment.createBlock(alternateScopeId);
    functionBuilder.blocks.set(alternateBlock.id, alternateBlock);

    functionBuilder.currentBlock = alternateBlock;
    buildOwnedBody(node.alternate, scope, functionBuilder, moduleBuilder, environment);
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
