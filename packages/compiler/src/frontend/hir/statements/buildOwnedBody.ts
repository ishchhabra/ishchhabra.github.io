import type { Statement } from "oxc-parser";
import { Environment } from "../../../environment";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
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
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): void {
  if (node.type !== "BlockStatement") {
    buildNode(node, fallbackScope, functionBuilder, moduleBuilder, environment);
    return;
  }

  const blockScope = functionBuilder.scopeFor(node);
  instantiateScopeBindings(node, blockScope, functionBuilder, environment, moduleBuilder);
  buildStatementList(node.body, blockScope, functionBuilder, moduleBuilder, environment);
}
