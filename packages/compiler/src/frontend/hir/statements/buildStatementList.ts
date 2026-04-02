import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

/**
 * Lower a sequence of statements while preserving hoisted function declarations.
 *
 * Once control flow terminates, ordinary statements are unreachable and skipped,
 * but function declarations in the same scope still need to be lowered because
 * their bindings are initialized during scope instantiation rather than at their
 * lexical execution position.
 */
export function buildStatementList(
  statementPaths: Array<NodePath<t.Node>>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  let terminated = functionBuilder.currentBlock.terminal !== undefined;

  for (const statementPath of statementPaths) {
    if (terminated && !statementPath.isFunctionDeclaration()) {
      continue;
    }

    buildNode(statementPath, functionBuilder, moduleBuilder, environment);

    if (!terminated && functionBuilder.currentBlock.terminal !== undefined) {
      terminated = true;
    }
  }
}
