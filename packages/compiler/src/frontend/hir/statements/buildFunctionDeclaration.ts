import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

/**
 * Function declarations are fully initialized during scope instantiation
 * (in buildFunctionDeclarationBindings), so there is nothing to do at
 * the statement's lexical position.
 */
export function buildFunctionDeclaration(
  _node: ESTree.FunctionDeclaration,
  _functionBuilder: FunctionIRBuilder,
  _moduleBuilder: ModuleIRBuilder,
  _environment: Environment,
) {
  return undefined;
}
