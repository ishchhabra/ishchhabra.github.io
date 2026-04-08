import type { ReturnStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { createInstructionId, ReturnTerminal } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildNode } from "../buildNode";

export function buildReturnStatement(
  node: ReturnStatement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  if (node.argument == null) {
    functionBuilder.currentBlock.terminal = new ReturnTerminal(
      createInstructionId(functionBuilder.environment),
      null,
    );
    return undefined;
  }

  const valuePlace = buildNode(node.argument, scope, functionBuilder, moduleBuilder, environment);
  if (valuePlace === undefined || Array.isArray(valuePlace)) {
    throw new Error("Return statement argument must be a single place");
  }

  functionBuilder.currentBlock.terminal = new ReturnTerminal(
    createInstructionId(functionBuilder.environment),
    valuePlace,
  );
  return undefined;
}
