import type { WhileStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { createOperationId, JumpOp, WhileTerm } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";

/**
 * Lower `while (test) { body }` to a flat CFG with a
 * {@link WhileTerm} header:
 *
 *   parentBlock --Jump--> headerBlock
 *   headerBlock (test ops) --WhileTerm--> bodyBlock / exitBlock
 *   bodyBlock ... --Jump--> headerBlock   (back-edge)
 */
export function buildWhileStatement(
  node: WhileStatement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const parentBlock = functionBuilder.currentBlock;

  const headerBlock = environment.createBlock();
  const bodyBlock = environment.createBlock();
  const exitBlock = environment.createBlock();
  functionBuilder.addBlock(headerBlock);
  functionBuilder.addBlock(bodyBlock);
  functionBuilder.addBlock(exitBlock);

  parentBlock.terminal = new JumpOp(createOperationId(environment), headerBlock.id, []);

  // Header: evaluate test, terminate with WhileTerm
  functionBuilder.currentBlock = headerBlock;
  const testPlace = buildNode(node.test, scope, functionBuilder, moduleBuilder, environment);
  if (testPlace === undefined || Array.isArray(testPlace)) {
    throw new Error("While statement test must be a single place");
  }
  headerBlock.terminal = new WhileTerm(
    createOperationId(environment),
    testPlace,
    bodyBlock,
    exitBlock,
    "while",
    label,
  );

  // Body
  functionBuilder.currentBlock = bodyBlock;
  functionBuilder.controlStack.push({
    kind: "loop",
    label,
    breakTarget: exitBlock.id,
    continueTarget: headerBlock.id,
    structured: false,
  });
  buildOwnedBody(node.body, scope, functionBuilder, moduleBuilder, environment);
  functionBuilder.controlStack.pop();
  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.terminal = new JumpOp(
      createOperationId(environment),
      headerBlock.id,
      [],
    );
  }

  functionBuilder.currentBlock = exitBlock;
  return undefined;
}
