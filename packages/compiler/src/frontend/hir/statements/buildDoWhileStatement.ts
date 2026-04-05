import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import {
  BranchTerminal,
  createInstructionId,
  JumpTerminal,
  LiteralInstruction,
  UnaryExpressionInstruction,
} from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

/**
 * Lowers `do { body } while (test)` to the equivalent:
 *
 *   while (true) { body; if (!test) break; }
 *
 * This reuses the existing while-loop back-edge codegen. The header
 * block uses a `true` literal as the while condition so that the loop
 * body always executes first. The test is evaluated at the end of the
 * body, and a conditional break exits the loop when the test is false.
 */
export function buildDoWhileStatement(
  node: ESTree.DoWhileStatement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const currentBlock = functionBuilder.currentBlock;

  // Build the test block — the `while(true)` header.
  const testBlock = environment.createBlock();
  functionBuilder.blocks.set(testBlock.id, testBlock);

  // Emit `true` as the while condition.
  functionBuilder.currentBlock = testBlock;
  const truePlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    environment.createInstruction(LiteralInstruction, truePlace, true),
  );
  const testBlockTerminus = functionBuilder.currentBlock;

  // Build the exit block (created early so break statements can reference it).
  const exitBlock = environment.createBlock();
  functionBuilder.blocks.set(exitBlock.id, exitBlock);

  // Build the body block.
  const bodyBlock = environment.createBlock();
  functionBuilder.blocks.set(bodyBlock.id, bodyBlock);

  functionBuilder.currentBlock = bodyBlock;
  functionBuilder.controlStack.push({
    kind: "loop",
    label,
    breakTarget: exitBlock.id,
    continueTarget: testBlock.id,
  });
  if (label) {
    functionBuilder.blockLabels.set(testBlock.id, label);
  }
  buildNode(node.body, scope, functionBuilder, moduleBuilder, environment);

  // After the body, evaluate the do-while test. If false, break.
  const doWhileTestPlace = buildNode(node.test, scope, functionBuilder, moduleBuilder, environment);
  if (doWhileTestPlace === undefined || Array.isArray(doWhileTestPlace)) {
    throw new Error("Do-while statement test must be a single place");
  }

  // Emit: if (!test) break — negate the test, then branch to a break
  // block. When test is true, fall through to the next iteration.
  const notTestPlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    environment.createInstruction(
      UnaryExpressionInstruction,
      notTestPlace,
      "!",
      doWhileTestPlace,
    ),
  );

  const breakBlock = environment.createBlock();
  functionBuilder.blocks.set(breakBlock.id, breakBlock);
  breakBlock.terminal = new JumpTerminal(
    createInstructionId(functionBuilder.environment),
    exitBlock.id,
  );

  const loopBackBlock = environment.createBlock();
  functionBuilder.blocks.set(loopBackBlock.id, loopBackBlock);
  loopBackBlock.terminal = new JumpTerminal(
    createInstructionId(functionBuilder.environment),
    testBlock.id,
  );

  const bodyBlockTerminus = functionBuilder.currentBlock;
  if (bodyBlockTerminus.terminal === undefined) {
    bodyBlockTerminus.terminal = new BranchTerminal(
      createInstructionId(functionBuilder.environment),
      notTestPlace,
      breakBlock.id,
      loopBackBlock.id,
      loopBackBlock.id,
    );
  }

  functionBuilder.controlStack.pop();

  // Set the branch terminal for the test block (while(true) -> always enter body).
  testBlockTerminus.terminal = new BranchTerminal(
    createInstructionId(functionBuilder.environment),
    truePlace,
    bodyBlock.id,
    exitBlock.id,
    exitBlock.id,
  );

  // Entry jumps to the test block.
  currentBlock.terminal = new JumpTerminal(
    createInstructionId(functionBuilder.environment),
    testBlock.id,
  );

  functionBuilder.currentBlock = exitBlock;
  return undefined;
}
