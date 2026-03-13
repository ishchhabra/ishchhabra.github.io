import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { createInstructionId, ThrowTerminal } from "../../../ir";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildThrowStatement(
  nodePath: NodePath<t.ThrowStatement>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): undefined {
  const argumentPath = nodePath.get("argument");
  const argumentPlace = buildNode(argumentPath, functionBuilder, moduleBuilder, environment);
  if (argumentPlace === undefined || Array.isArray(argumentPlace)) {
    throw new Error("Throw statement argument must be a single expression");
  }

  functionBuilder.currentBlock.terminal = new ThrowTerminal(
    createInstructionId(environment),
    argumentPlace,
  );

  return undefined;
}
