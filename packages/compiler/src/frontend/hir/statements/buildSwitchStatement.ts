import type { Statement, SwitchStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import {
  createOperationId,
  JumpOp,
  type SwitchCase as SwitchTermCase,
  SwitchTerm,
  Value,
} from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { instantiateScopeBindings } from "../bindings";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildStatementList } from "./buildStatementList";

/**
 * Lower `switch (discriminant) { ... }` to flat CFG with SwitchTerm.
 * Each case becomes a block; fall-through is CFG jumps between case
 * blocks; break jumps to fallthrough.
 */
export function buildSwitchStatement(
  node: SwitchStatement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const switchScope = functionBuilder.scopeFor(node);
  instantiateScopeBindings(node, switchScope, functionBuilder, environment, moduleBuilder);

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

  // Evaluate case tests in the parent block
  const caseTests: (Value | null)[] = [];
  for (const switchCase of node.cases) {
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
      caseTests.push(place);
    } else {
      caseTests.push(null);
    }
  }
  // parentBlock captured AFTER expression evaluation — compound
  // discriminants / case tests may have moved currentBlock.
  const parentBlock = functionBuilder.currentBlock;

  const caseBlocks = node.cases.map(() => environment.createBlock());
  const fallthroughBlock = environment.createBlock();
  for (const b of caseBlocks) functionBuilder.addBlock(b);
  functionBuilder.addBlock(fallthroughBlock);

  // Build each case body
  for (let i = 0; i < node.cases.length; i++) {
    const caseBlock = caseBlocks[i];
    functionBuilder.currentBlock = caseBlock;
    functionBuilder.controlStack.push({
      kind: "switch",
      label,
      breakTarget: fallthroughBlock.id,
      structured: false,
    });
    const statements = node.cases[i].consequent as Statement[];
    buildStatementList(statements, switchScope, functionBuilder, moduleBuilder, environment);
    functionBuilder.controlStack.pop();
    if (functionBuilder.currentBlock.terminal === undefined) {
      // Fall-through to next case or fallthroughBlock if last
      const nextTarget = i + 1 < caseBlocks.length ? caseBlocks[i + 1] : fallthroughBlock;
      functionBuilder.currentBlock.terminal = new JumpOp(createOperationId(environment), nextTarget, []);
    }
  }

  // Build SwitchTerm
  const termCases: SwitchTermCase[] = [];
  let defaultBlock: ReturnType<typeof environment.createBlock> | null = null;
  for (let i = 0; i < caseTests.length; i++) {
    const test = caseTests[i];
    const block = caseBlocks[i];
    if (test === null) {
      defaultBlock = block;
    } else {
      termCases.push({ test, block });
    }
  }
  if (defaultBlock === null) {
    defaultBlock = fallthroughBlock;
  }

  parentBlock.terminal = new SwitchTerm(
    createOperationId(environment),
    discriminantPlace,
    termCases,
    defaultBlock,
    fallthroughBlock,
    label,
  );

  functionBuilder.currentBlock = fallthroughBlock;
  return undefined;
}
