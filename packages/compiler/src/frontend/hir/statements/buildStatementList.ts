import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

/**
 * Lower a sequence of statements, hoisting function declarations to the top.
 *
 * Mirrors the ECMAScript spec's declaration instantiation: function
 * declarations are initialized (body built, instruction emitted) before
 * any other statement executes. This ensures forward references to
 * functions work correctly, matching runtime hoisting semantics.
 *
 * Pass 1: Emit function declarations (hoisted — fully available before
 *         their lexical position).
 * Pass 2: Emit everything else in source order, skipping already-emitted
 *         function declarations. Once control flow terminates, ordinary
 *         statements are unreachable and skipped.
 */
export function buildStatementList(
  statementPaths: Array<NodePath<t.Node>>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  // Pass 1: Hoist function declarations.
  for (const statementPath of statementPaths) {
    if (statementPath.isFunctionDeclaration()) {
      buildNode(statementPath, functionBuilder, moduleBuilder, environment);
    }
  }

  // Pass 2: Emit remaining statements in source order.
  let terminated = functionBuilder.currentBlock.terminal !== undefined;

  for (const statementPath of statementPaths) {
    if (statementPath.isFunctionDeclaration()) {
      continue;
    }

    if (terminated) {
      continue;
    }

    buildNode(statementPath, functionBuilder, moduleBuilder, environment);

    if (functionBuilder.currentBlock.terminal !== undefined) {
      terminated = true;
    }
  }
}
