import { parseSync } from "oxc-parser";
import type { Node, Program } from "oxc-parser";
import { Environment } from "../../../environment";
import { ProjectEnvironment } from "../../../ProjectEnvironment";
import { ProjectBuilder } from "../../ProjectBuilder";
import type { FuncOp } from "../../../ir/core/FuncOp";
import type { Operation } from "../../../ir/core/Operation";
import { analyzeScopes, type Scope, type ScopeMap } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

/**
 * Test utilities for HIR builders.
 *
 * Two harness flavors:
 *
 *   - {@link buildFn} / {@link printFn}: drives the full HIR pipeline
 *     end-to-end. Use when you want to assert on the IR a real module
 *     produces.
 *
 *   - {@link makeIsolatedHarness}: returns a primed {@link FuncOpBuilder}
 *     with no ops appended yet, plus the parsed program and its scope
 *     map. Callers locate the AST node they want to exercise (via
 *     {@link findAstNode}) and invoke one specific `buildX` function
 *     directly. Isolates a single builder from the dispatch wrapper
 *     (`buildExpressionStatement`, `buildStatementList`, …) so the
 *     test exercises exactly one unit.
 *
 *   - {@link printOps}: renders an array of ops as text IR, one per
 *     line. Useful against `fnBuilder.currentBlock.operations` after
 *     an isolated call.
 */

// ---- End-to-end harness -------------------------------------------

export function buildFn(source: string): FuncOp {
  const unit = new ProjectBuilder().buildFromSource(source, "m.js");
  const fn = unit.modules.get("m.js")!.entryFuncOp;
  if (!fn) throw new Error("expected entry function");
  return fn;
}

export function printFn(fn: FuncOp): string {
  const lines: string[] = [];
  for (const block of fn.allBlocks()) {
    lines.push(`bb${block.id}:`);
    for (const op of block.operations) lines.push("  " + op.print());
    if (block.terminal) lines.push("  " + block.terminal.print());
  }
  return lines.join("\n");
}

export function findOp<T extends Operation>(
  fn: FuncOp,
  Ctor: new (...args: never[]) => T,
): T {
  for (const block of fn.allBlocks()) {
    for (const op of block.operations) if (op instanceof Ctor) return op as T;
  }
  throw new Error(`op of type ${Ctor.name} not found`);
}

// ---- Isolated-builder harness -------------------------------------

export interface IsolatedHarness {
  env: Environment;
  moduleBuilder: ModuleIRBuilder;
  fnBuilder: FuncOpBuilder;
  scope: Scope;
  program: Program;
  scopeMap: ScopeMap;
}

/**
 * Parse `source`, run scope analysis, and return a primed
 * {@link FuncOpBuilder} whose entry block is empty. Callers locate
 * the AST node of interest (see {@link findAstNode}) and invoke a
 * specific `buildX` function against it; the ops produced land in
 * `fnBuilder.currentBlock`.
 *
 * Note: this does *not* run `instantiateScopeBindings`, so identifiers
 * referencing module-level declarations resolve as `LoadGlobal`. For
 * tests of builders that depend on locally-declared bindings, prefer
 * the end-to-end {@link buildFn}.
 */
export function makeIsolatedHarness(source: string): IsolatedHarness {
  const env = new Environment(new ProjectEnvironment());
  const moduleBuilder = new ModuleIRBuilder("m.js", env);
  const result = parseSync("m.js", source, {
    sourceType: "module",
    astType: "ts",
    preserveParens: false,
  });
  if (result.errors.length > 0) {
    throw new Error(`parse errors: ${result.errors.map((e) => e.message).join("; ")}`);
  }
  const program = result.program as unknown as Program;
  const { programScope, scopeMap } = analyzeScopes(program);
  const fnBuilder = new FuncOpBuilder(
    [],
    program,
    programScope,
    scopeMap,
    env,
    moduleBuilder,
    false,
    false,
  );
  return { env, moduleBuilder, fnBuilder, scope: programScope, program, scopeMap };
}

/**
 * DFS the AST and return the first node matching `predicate`. Throws
 * if not found so tests fail loudly instead of proceeding with
 * undefined.
 */
export function findAstNode<T extends Node>(
  root: Node,
  predicate: (node: Node) => node is T,
): T {
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (predicate(node)) return node;
    for (const key in node) {
      const child = (node as unknown as Record<string, unknown>)[key];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) {
        for (const c of child) if (isNode(c)) stack.push(c);
      } else if (isNode(child)) {
        stack.push(child);
      }
    }
  }
  throw new Error("AST node not found");
}

function isNode(value: unknown): value is Node {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

// ---- Printing helpers ---------------------------------------------

export function printOps(ops: readonly Operation[]): string {
  return ops.map((op) => op.print()).join("\n");
}
