import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { JumpTerminal, LabeledBlockStructure, createInstructionId } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildDoWhileStatement } from "./buildDoWhileStatement";
import { buildForInStatement } from "./buildForInStatement";
import { buildForOfStatement } from "./buildForOfStatement";
import { buildForStatement } from "./buildForStatement";
import { buildStatement } from "./buildStatement";
import { buildSwitchStatement } from "./buildSwitchStatement";
import { buildWhileStatement } from "./buildWhileStatement";

export function buildLabeledStatement(
  nodePath: NodePath<t.LabeledStatement>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const label = nodePath.node.label.name;
  const bodyPath = nodePath.get("body");

  // For loops and switches, pass the label directly to the builder
  // so it attaches the label to its own control context.
  if (bodyPath.isForStatement()) {
    return buildForStatement(bodyPath, functionBuilder, moduleBuilder, environment, label);
  }
  if (bodyPath.isWhileStatement()) {
    return buildWhileStatement(bodyPath, functionBuilder, moduleBuilder, environment, label);
  }
  if (bodyPath.isDoWhileStatement()) {
    return buildDoWhileStatement(bodyPath, functionBuilder, moduleBuilder, environment, label);
  }
  if (bodyPath.isForInStatement()) {
    return buildForInStatement(bodyPath, functionBuilder, moduleBuilder, environment, label);
  }
  if (bodyPath.isForOfStatement()) {
    return buildForOfStatement(bodyPath, functionBuilder, moduleBuilder, environment, label);
  }
  if (bodyPath.isSwitchStatement()) {
    return buildSwitchStatement(bodyPath, functionBuilder, moduleBuilder, environment, label);
  }

  // Non-loop/non-switch: create a labeled block structure.
  // This enables `break label` to exit the block early.
  const currentBlock = functionBuilder.currentBlock;

  const headerBlock = environment.createBlock();
  functionBuilder.blocks.set(headerBlock.id, headerBlock);

  const bodyBlock = environment.createBlock();
  functionBuilder.blocks.set(bodyBlock.id, bodyBlock);

  const exitBlock = environment.createBlock();
  functionBuilder.blocks.set(exitBlock.id, exitBlock);

  // Wire current block → header block.
  currentBlock.terminal = new JumpTerminal(createInstructionId(environment), headerBlock.id);

  // Build the body inside a labeled control context.
  functionBuilder.currentBlock = bodyBlock;
  functionBuilder.controlStack.push({
    kind: "label",
    label,
    breakTarget: exitBlock.id,
  });
  buildStatement(bodyPath, functionBuilder, moduleBuilder, environment);
  functionBuilder.controlStack.pop();

  // If the body didn't terminate, jump to the exit block.
  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.terminal = new JumpTerminal(
      createInstructionId(environment),
      exitBlock.id,
    );
  }

  // Register the structure on the header block.
  functionBuilder.structures.set(
    headerBlock.id,
    new LabeledBlockStructure(headerBlock.id, bodyBlock.id, exitBlock.id, label),
  );

  functionBuilder.currentBlock = exitBlock;
  return undefined;
}
