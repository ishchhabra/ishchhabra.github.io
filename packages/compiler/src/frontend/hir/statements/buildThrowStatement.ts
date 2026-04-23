import type { ThrowStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { createOperationId, ThrowTermOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildThrowStatement(
  node: ThrowStatement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): undefined {
  const argumentPlace = buildNode(
    node.argument,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
  );
  if (argumentPlace === undefined || Array.isArray(argumentPlace)) {
    throw new Error("Throw statement argument must be a single expression");
  }

  functionBuilder.currentBlock.setTerminal(new ThrowTermOp(
    createOperationId(environment),
    argumentPlace,
  ));

  return undefined;
}
