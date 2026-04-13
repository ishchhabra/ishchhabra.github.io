import type { Statement } from "oxc-parser";
import { Environment } from "../../../environment";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { instantiateScopeBindings } from "../bindings";
import { buildStatementList } from "./buildStatementList";
import { type Scope } from "../../scope/Scope";

/**
 * Lower a statement into a construct body that already owns its `{}` syntax.
 *
 * When the source body is a BlockStatement we inline its statements into the
 * current block instead of creating a separate BlockOp, because the
 * enclosing construct (`if`, loop, `try`, labeled block, etc.) already emits
 * the braces for the body.
 */
export function buildOwnedBody(
  node: Statement,
  fallbackScope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): void {
  if (node.type !== "BlockStatement") {
    buildNode(node, fallbackScope, functionBuilder, moduleBuilder, environment);
    return;
  }

  const blockScope = functionBuilder.scopeFor(node);
  functionBuilder.lexicalScopeIdFor(blockScope);
  instantiateScopeBindings(node, blockScope, functionBuilder, environment, moduleBuilder);
  buildStatementList(node.body, blockScope, functionBuilder, moduleBuilder, environment);
}
