import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

/**
 * Lower a sequence of statements. Once control flow terminates, remaining
 * statements are unreachable and skipped. Function declarations no longer
 * need special handling here because they are fully initialized during
 * scope instantiation.
 */
export function buildStatementList(
  statementPaths: Array<NodePath<t.Node>>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  for (const statementPath of statementPaths) {
    if (functionBuilder.currentBlock.terminal !== undefined) {
      break;
    }

    buildNode(statementPath, functionBuilder, moduleBuilder, environment);
  }
}
