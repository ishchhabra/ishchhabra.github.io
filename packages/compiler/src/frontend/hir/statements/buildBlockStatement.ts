import type { BlockStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";

/**
 * `{ ... }` — plain block statement. Lexical scope is a source-level
 * concept (let/const shadowing) already modeled by Scope metadata;
 * it does NOT require a new CFG block. Body statements inline
 * directly into the current block. Codegen re-emits braces based on
 * scope boundaries it detects in the IR, not on separate CFG nodes.
 *
 * Note: this is a behavioral fix — wrapping plain `{}` in its own
 * CFG block broke classical dataflow analyses that assume a
 * declaration's uses are reachable via dominance on the flat CFG.
 * Specifically, `const length = ...` inside a `{}` would land in a
 * different basic block than `while (cursor < length)` even when
 * both are in the same lexical scope, breaking mem2reg for
 * `length`.
 */
export function buildBlockStatement(
  node: BlockStatement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  buildOwnedBody(node, scope, functionBuilder, moduleBuilder, environment);
  return undefined;
}
