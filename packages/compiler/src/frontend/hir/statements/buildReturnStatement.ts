import type { ReturnStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { createOperationId, ReturnTermOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildNode } from "../buildNode";

export function buildReturnStatement(
  node: ReturnStatement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  if (node.argument == null) {
    functionBuilder.currentBlock.setTerminal(new ReturnTermOp(
      createOperationId(functionBuilder.environment),
      null,
    ));
    return undefined;
  }

  const valuePlace = buildNode(node.argument, scope, functionBuilder, moduleBuilder, environment);
  if (valuePlace === undefined || Array.isArray(valuePlace)) {
    throw new Error("Return statement argument must be a single place");
  }

  functionBuilder.currentBlock.setTerminal(new ReturnTermOp(
    createOperationId(functionBuilder.environment),
    valuePlace,
  ));
  return undefined;
}
