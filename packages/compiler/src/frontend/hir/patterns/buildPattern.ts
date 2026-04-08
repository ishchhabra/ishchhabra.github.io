import type * as AST from "../../estree";
import type { SpreadElement } from "oxc-parser";
import { Environment } from "../../../environment";
import { Place } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildArrayPattern } from "./buildArrayPattern";

export function buildPattern(
  node: AST.Pattern | SpreadElement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  switch (node.type) {
    case "ArrayPattern":
      return buildArrayPattern(node, scope, functionBuilder, moduleBuilder, environment);
    default:
      throw new Error(`Unsupported pattern type: ${node.type}`);
  }
}
