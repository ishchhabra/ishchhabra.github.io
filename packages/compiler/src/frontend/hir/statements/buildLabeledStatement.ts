import type { LabeledStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { createOperationId, JumpOp, LabeledTerm } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
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
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const label = node.label.name;
  const body = node.body;

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

  // Non-loop/non-switch labeled: emit flat CFG + LabeledTerm.
  const parentBlock = functionBuilder.currentBlock;
  const bodyBlock = environment.createBlock();
  const fallthroughBlock = environment.createBlock();
  functionBuilder.addBlock(bodyBlock);
  functionBuilder.addBlock(fallthroughBlock);

  parentBlock.setTerminal(new LabeledTerm(
    createOperationId(environment),
    bodyBlock,
    fallthroughBlock,
    label,
  ));

  functionBuilder.currentBlock = bodyBlock;
  functionBuilder.controlStack.push({
    kind: "label",
    label,
    breakTarget: fallthroughBlock.id,
    structured: false,
  });
  buildOwnedBody(body, scope, functionBuilder, moduleBuilder, environment);
  functionBuilder.controlStack.pop();

  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.setTerminal(new JumpOp(createOperationId(environment), fallthroughBlock, []));
  }

  functionBuilder.currentBlock = fallthroughBlock;
  return undefined;
}
