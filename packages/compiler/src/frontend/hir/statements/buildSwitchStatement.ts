import type * as AST from "../../estree";
import { Environment } from "../../../environment";
import { createInstructionId, JumpTerminal, SwitchTerminal } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { instantiateScopeBindings } from "../bindings";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildStatementList } from "./buildStatementList";

export function buildSwitchStatement(
  node: AST.SwitchStatement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const currentBlock = functionBuilder.currentBlock;
  const scopeId = functionBuilder.lexicalScopeIdFor(scope);

  const switchScope = functionBuilder.scopeFor(node);
  const switchScopeId = functionBuilder.lexicalScopeIdFor(switchScope, "switch");
  instantiateScopeBindings(node, switchScope, functionBuilder, environment, moduleBuilder);

  // Build the discriminant expression in the current block.
  const discriminantPlace = buildNode(
    node.discriminant,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
  );
  if (discriminantPlace === undefined || Array.isArray(discriminantPlace)) {
    throw new Error("Switch discriminant must be a single place");
  }

  // Create the fallthrough block (continuation after switch).
  const fallthroughBlock = environment.createBlock(scopeId);
  functionBuilder.blocks.set(fallthroughBlock.id, fallthroughBlock);

  // Register switch control context so BreakStatement can jump to fallthrough.
  functionBuilder.controlStack.push({ kind: "switch", label, breakTarget: fallthroughBlock.id });

  const switchCases = node.cases;
  const cases: Array<{
    test: import("../../../ir").Place | null;
    block: import("../../../ir").BlockId;
  }> = [];

  // Process cases in reverse order to handle fallthrough.
  // Each case's default terminal falls through to the next case's block.
  // The last case falls through to the fallthrough block.
  let nextFallthroughTarget = fallthroughBlock.id;

  const caseEntries: Array<{
    test: import("../../../ir").Place | null;
    block: import("../../../ir").BasicBlock;
  }> = [];

  // First pass: create blocks and evaluate test expressions.
  // Test expressions are evaluated in the switch's lexical scope so they
  // observe the switch block's bindings (including TDZ for let/const/class).
  // The discriminant was already evaluated in the outer scope above.
  for (const switchCase of switchCases) {
    let testPlace: import("../../../ir").Place | null = null;

    if (switchCase.test != null) {
      const place = buildNode(
        switchCase.test,
        switchScope,
        functionBuilder,
        moduleBuilder,
        environment,
      );
      if (place === undefined || Array.isArray(place)) {
        throw new Error("Switch case test must be a single place");
      }
      testPlace = place;
    }

    const caseBlock = environment.createBlock(switchScopeId);
    functionBuilder.blocks.set(caseBlock.id, caseBlock);

    caseEntries.push({ test: testPlace, block: caseBlock });
  }

  // Second pass: build case bodies in reverse order for fallthrough wiring.
  for (let i = caseEntries.length - 1; i >= 0; i--) {
    const switchCase = switchCases[i];
    const entry = caseEntries[i];

    functionBuilder.currentBlock = entry.block;

    // Build the case body statements.
    buildStatementList(
      switchCase.consequent as AST.Statement[],
      switchScope,
      functionBuilder,
      moduleBuilder,
      environment,
    );

    // If the case body didn't end with a terminal (no break/return/throw),
    // add fallthrough to the next case's block (or the fallthrough block for last case).
    if (functionBuilder.currentBlock.terminal === undefined) {
      functionBuilder.currentBlock.terminal = new JumpTerminal(
        createInstructionId(environment),
        nextFallthroughTarget,
      );
    }

    nextFallthroughTarget = entry.block.id;

    cases.unshift({ test: entry.test, block: entry.block.id });
  }

  functionBuilder.controlStack.pop();

  // If no default case exists, synthesize one that jumps to fallthrough.
  const hasDefault = cases.some((c) => c.test === null);
  if (!hasDefault) {
    cases.push({ test: null, block: fallthroughBlock.id });
  }

  // Set the SwitchTerminal on the pre-switch block.
  currentBlock.terminal = new SwitchTerminal(
    createInstructionId(environment),
    discriminantPlace,
    cases,
    fallthroughBlock.id,
    label,
  );

  functionBuilder.currentBlock = fallthroughBlock;
  return undefined;
}
