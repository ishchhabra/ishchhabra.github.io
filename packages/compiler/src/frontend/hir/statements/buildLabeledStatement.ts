import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { JumpTerminal, LabeledBlockStructure, createInstructionId } from "../../../ir";
import { type Scope } from "../../scope/Scope";
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
  node: ESTree.LabeledStatement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const label = node.label.name;
  const body = node.body;

  // For loops and switches, pass the label directly to the builder
  // so it attaches the label to its own control context.
  if (body.type === "ForStatement") {
    return buildForStatement(body, scope, functionBuilder, moduleBuilder, environment, label);
  }
  if (body.type === "WhileStatement") {
    return buildWhileStatement(body, scope, functionBuilder, moduleBuilder, environment, label);
  }
  if (body.type === "DoWhileStatement") {
    return buildDoWhileStatement(body, scope, functionBuilder, moduleBuilder, environment, label);
  }
  if (body.type === "ForInStatement") {
    return buildForInStatement(body, scope, functionBuilder, moduleBuilder, environment, label);
  }
  if (body.type === "ForOfStatement") {
    return buildForOfStatement(body, scope, functionBuilder, moduleBuilder, environment, label);
  }
  if (body.type === "SwitchStatement") {
    return buildSwitchStatement(body, scope, functionBuilder, moduleBuilder, environment, label);
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

  // Wire current block -> header block.
  currentBlock.terminal = new JumpTerminal(createInstructionId(environment), headerBlock.id);

  // Build the body inside a labeled control context.
  functionBuilder.currentBlock = bodyBlock;
  functionBuilder.controlStack.push({
    kind: "label",
    label,
    breakTarget: exitBlock.id,
  });
  buildStatement(body, scope, functionBuilder, moduleBuilder, environment);
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
