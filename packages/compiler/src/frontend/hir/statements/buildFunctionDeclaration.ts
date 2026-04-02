import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

/**
 * Function declarations are fully initialized during scope instantiation
 * (in buildFunctionDeclarationBindings), so there is nothing to do at
 * the statement's lexical position.
 */
export function buildFunctionDeclaration(
  _nodePath: NodePath<t.FunctionDeclaration>,
  _functionBuilder: FunctionIRBuilder,
  _moduleBuilder: ModuleIRBuilder,
  _environment: Environment,
) {
  return undefined;
}
