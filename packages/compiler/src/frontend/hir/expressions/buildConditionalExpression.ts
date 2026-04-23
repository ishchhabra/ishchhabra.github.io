import type { ConditionalExpression, Expression } from "oxc-parser";
import { Environment } from "../../../environment";
import { BasicBlock, createOperationId, IfTerm, JumpOp, Value } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildNode } from "../buildNode";

/**
 * Lower `test ? consequent : alternate` to flat CFG with IfTerm.
 * The merged result flows via a block parameter on the join block.
 *
 *   parentBlock  --IfTerm-->  consBlock / altBlock
 *   consBlock  --(cons ops; Jump(join(consVal)))
 *   altBlock   --(alt ops;  Jump(join(altVal)))
 *   joinBlock(%result):  caller reads %result
 */
export function buildConditionalExpression(
  node: ConditionalExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value {
  const testPlace = buildNode(node.test, scope, functionBuilder, moduleBuilder, environment);
  if (testPlace === undefined || Array.isArray(testPlace)) {
    throw new Error("Conditional expression test must be a single place");
  }
  const parentBlock = functionBuilder.currentBlock;

  const consBlock = environment.createBlock();
  const altBlock = environment.createBlock();
  const joinBlock = environment.createBlock();
  const resultPlace = environment.createValue();
  joinBlock.params = [resultPlace];
  functionBuilder.addBlock(consBlock);
  functionBuilder.addBlock(altBlock);
  functionBuilder.addBlock(joinBlock);

  parentBlock.setTerminal(new IfTerm(createOperationId(environment), testPlace, consBlock, altBlock, joinBlock));

  functionBuilder.currentBlock = consBlock;
  buildArm(node.consequent, joinBlock, scope, functionBuilder, moduleBuilder, environment);

  functionBuilder.currentBlock = altBlock;
  buildArm(node.alternate, joinBlock, scope, functionBuilder, moduleBuilder, environment);

  functionBuilder.currentBlock = joinBlock;
  return resultPlace;
}

function buildArm(
  node: Expression,
  joinBlock: BasicBlock,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): void {
  const place = buildNode(node, scope, functionBuilder, moduleBuilder, environment);
  if (place === undefined || Array.isArray(place)) {
    throw new Error("Conditional expression arm must be a single place");
  }
  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.setTerminal(new JumpOp(createOperationId(environment), joinBlock, [place]));
  }
}
