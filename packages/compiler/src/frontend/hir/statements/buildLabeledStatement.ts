import type { LabeledStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { JumpOp, LabeledBlockOp, Region, createOperationId } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";
import { buildDoWhileStatement } from "./buildDoWhileStatement";
import { buildForInStatement } from "./buildForInStatement";
import { buildForOfStatement } from "./buildForOfStatement";
import { buildForStatement } from "./buildForStatement";
import { buildSwitchStatement } from "./buildSwitchStatement";
import { buildWhileStatement } from "./buildWhileStatement";

export function buildLabeledStatement(
  node: LabeledStatement,
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
  const scopeId = functionBuilder.lexicalScopeIdFor(scope);

  const headerBlock = environment.createBlock(scopeId);
  functionBuilder.addBlock(headerBlock);

  const bodyScope = body.type === "BlockStatement" ? functionBuilder.scopeFor(body) : scope;
  const bodyScopeId = functionBuilder.lexicalScopeIdFor(bodyScope);
  const bodyBlock = environment.createBlock(bodyScopeId);
  functionBuilder.addBlock(bodyBlock);

  const exitBlock = environment.createBlock(scopeId);
  functionBuilder.addBlock(exitBlock);

  // Wire current block -> header block.
  currentBlock.terminal = new JumpOp(createOperationId(environment), headerBlock.id);

  const bodyRegion = new Region([]);
  bodyRegion.moveBlockHere(bodyBlock);

  // Build the body inside a labeled control context.
  functionBuilder.currentBlock = bodyBlock;
  functionBuilder.controlStack.push({
    kind: "label",
    label,
    breakTarget: exitBlock.id,
    structured: true,
  });
  functionBuilder.withStructureRegion(bodyRegion, () => {
    buildOwnedBody(body, scope, functionBuilder, moduleBuilder, environment);
  });
  functionBuilder.controlStack.pop();

  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.terminal = new JumpOp(
      createOperationId(environment),
      exitBlock.id,
    );
  }

  // Register the structure on the header block.
  functionBuilder.structures.set(
    headerBlock.id,
    new LabeledBlockOp(
      createOperationId(environment),
      headerBlock.id,
      exitBlock.id,
      label,
      bodyRegion,
    ),
  );

  functionBuilder.currentBlock = exitBlock;
  return undefined;
}
