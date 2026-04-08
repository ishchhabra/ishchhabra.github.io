import type { Statement } from "oxc-parser";
import { Environment } from "../../../environment";
import { isTSOnlyNode } from "../../estree";
import { type Scope } from "../../scope/Scope";
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
  statements: Statement[],
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  for (const stmt of statements) {
    if (functionBuilder.currentBlock.terminal !== undefined) {
      break;
    }

    if (isTSOnlyNode(stmt)) {
      continue;
    }

    buildNode(stmt, scope, functionBuilder, moduleBuilder, environment);
  }
}
