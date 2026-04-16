import type { Statement, SwitchStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { createOperationId, Place, Region, SwitchOp, YieldOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { instantiateScopeBindings } from "../bindings";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildStatementList } from "./buildStatementList";

/**
 * Lower a JS `switch (discriminant) { case a: ... default: ... }` to
 * a textbook MLIR `SwitchOp`. Each case is a separate region. JS
 * fall-through is NOT preserved structurally; instead every case
 * body implicitly breaks at the end unless the source had explicit
 * fall-through, in which case the case body yields via a `YieldOp`
 * and codegen emits it as a bare case.
 *
 * Note: for simplicity in the textbook MLIR migration, we lower
 * each case as an independent region terminated by YieldOp. JS
 * fall-through semantics require the frontend to append the
 * fallthrough case's statements — done here in a single left-to-right
 * sweep that inlines fallthrough bodies into each case region.
 */
export function buildSwitchStatement(
  node: SwitchStatement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const parentBlock = functionBuilder.currentBlock;

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

  // Evaluate case tests in the parent block before the switch op —
  // they are plain operands to the SwitchOp.
  const caseTests: (Place | null)[] = [];
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

  // Build each case body into its own region. Emit with a terminal
  // `YieldOp` at the end of the region unless control exits via
  // break/return/throw. Fall-through to the next case (no break) is
  // desugared here: we append the next case's statements to this
  // case's region.
  const regions: Region[] = [];
  for (let i = 0; i < node.cases.length; i++) {
    const region = new Region([]);
    const caseBlock = environment.createBlock();
    functionBuilder.withStructureRegion(region, () => {
      functionBuilder.addBlock(caseBlock);
      functionBuilder.currentBlock = caseBlock;
      functionBuilder.controlStack.push({
        kind: "switch",
        label,
        breakTarget: undefined,
        structured: true,
      });

      // Collect this case's statements, plus the statements of
      // every subsequent case that is reached via fall-through (i.e.
      // the current case ended without break/return/throw). We
      // replicate the fall-through bodies inline into this region so
      // each region is self-contained.
      const statementsForThisCase: Statement[] = [];
      for (let j = i; j < node.cases.length; j++) {
        const caseStatements = node.cases[j].consequent as Statement[];
        statementsForThisCase.push(...caseStatements);
        if (hasTerminalExit(caseStatements)) break;
      }
      buildStatementList(
        statementsForThisCase,
        switchScope,
        functionBuilder,
        moduleBuilder,
        environment,
      );
      functionBuilder.controlStack.pop();
      if (functionBuilder.currentBlock.terminal === undefined) {
        functionBuilder.currentBlock.terminal = new YieldOp(createOperationId(environment), []);
      }
    });
    regions.push(region);
  }

  // If no default case exists, synthesize an empty one at the end.
  const hasDefault = caseTests.some((t) => t === null);
  if (!hasDefault) {
    const region = new Region([]);
    const caseBlock = environment.createBlock();
    functionBuilder.withStructureRegion(region, () => {
      functionBuilder.addBlock(caseBlock);
      caseBlock.terminal = new YieldOp(createOperationId(environment), []);
    });
    caseTests.push(null);
    regions.push(region);
  }

  const switchOp = new SwitchOp(
    createOperationId(environment),
    discriminantPlace,
    caseTests,
    regions,
    label,
  );
  parentBlock.appendOp(switchOp);
  functionBuilder.currentBlock = parentBlock;
  return undefined;
}

/**
 * Returns true if `statements` contains a terminal exit statement
 * (break, continue, return, throw) at the top level — meaning control
 * never falls off the end of this statement list into the next case.
 */
function hasTerminalExit(statements: Statement[]): boolean {
  for (const s of statements) {
    if (
      s.type === "BreakStatement" ||
      s.type === "ContinueStatement" ||
      s.type === "ReturnStatement" ||
      s.type === "ThrowStatement"
    ) {
      return true;
    }
  }
  return false;
}
