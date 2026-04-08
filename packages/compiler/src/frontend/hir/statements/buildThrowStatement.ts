import type * as AST from "../../estree";
import { Environment } from "../../../environment";
import { createInstructionId, ThrowTerminal } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildThrowStatement(
  node: AST.ThrowStatement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
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

  functionBuilder.currentBlock.terminal = new ThrowTerminal(
    createInstructionId(environment),
    argumentPlace,
  );

  return undefined;
}
