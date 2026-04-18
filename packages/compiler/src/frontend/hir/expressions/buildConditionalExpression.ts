import type { ConditionalExpression, Expression } from "oxc-parser";
import { Environment } from "../../../environment";
import { createOperationId, IfOp, Value, Region, YieldOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildNode } from "../buildNode";

/**
 * Lower `test ? consequent : alternate` to a textbook MLIR `IfOp`
 * with one result place — the merged expression value.
 *
 *   [test compute ops]
 *   %result = IfOp(test) {
 *     [cons compute ops]
 *     YieldOp(%consValue)
 *   } else {
 *     [alt compute ops]
 *     YieldOp(%altValue)
 *   }
 *
 * The caller receives `%result` and may use it as any other value.
 */
export function buildConditionalExpression(
  node: ConditionalExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value {
  const parentBlock = functionBuilder.currentBlock;

  const testPlace = buildNode(node.test, scope, functionBuilder, moduleBuilder, environment);
  if (testPlace === undefined || Array.isArray(testPlace)) {
    throw new Error("Conditional expression test must be a single place");
  }

  const consResult = buildArm(node.consequent, scope, functionBuilder, moduleBuilder, environment);
  const altResult = buildArm(node.alternate, scope, functionBuilder, moduleBuilder, environment);

  const resultPlace = environment.createValue();

  const ifOp = new IfOp(
    createOperationId(environment),
    testPlace,
    [resultPlace],
    consResult.region,
    altResult.region,
  );
  parentBlock.appendOp(ifOp);
  functionBuilder.currentBlock = parentBlock;
  return resultPlace;
}

function buildArm(
  node: Expression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): { region: Region } {
  const region = new Region([]);
  const block = environment.createBlock();
  functionBuilder.withStructureRegion(region, () => {
    functionBuilder.addBlock(block);
    functionBuilder.currentBlock = block;

    const place = buildNode(node, scope, functionBuilder, moduleBuilder, environment);
    if (place === undefined || Array.isArray(place)) {
      throw new Error("Conditional expression arm must be a single place");
    }

    if (functionBuilder.currentBlock.terminal === undefined) {
      functionBuilder.currentBlock.terminal = new YieldOp(createOperationId(environment), [place]);
    }
  });
  return { region };
}
