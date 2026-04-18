import type { DoWhileStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import {
  BreakOp,
  ConditionOp,
  createOperationId,
  IfOp,
  LiteralOp,
  Region,
  UnaryExpressionOp,
  WhileOp,
  YieldOp,
} from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";

/**
 * Lower `do { body } while (test)` to `while (true) { body; if (!test) break; }`.
 *
 *   parentBlock: [..., WhileOp, ...]
 *     WhileOp.beforeRegion: [beforeBlock]
 *       beforeBlock: [LiteralOp true, ConditionOp(true)]
 *     WhileOp.bodyRegion: [bodyBlock]
 *       bodyBlock: [...body ops..., !test, IfOp, YieldOp]
 *         IfOp.consequentRegion: [consBlock]
 *           consBlock: [BreakOp]
 *
 * The before region's `condition true` is structurally a no-op test
 * — codegen can recognize the pattern and emit `do { body } while
 * (test)` instead of `while (true) { body; if (!test) break; }`. For
 * now we keep the desugared shape because it round-trips correctly
 * even without that recognition.
 */
export function buildDoWhileStatement(
  node: DoWhileStatement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const parentBlock = functionBuilder.currentBlock;

  // Before region: `condition true` (loop never exits via the test).
  const beforeRegion = new Region([]);
  const beforeBlock = environment.createBlock();
  functionBuilder.withStructureRegion(beforeRegion, () => {
    functionBuilder.addBlock(beforeBlock);
    functionBuilder.currentBlock = beforeBlock;
    const truePlace = environment.createValue();
    functionBuilder.addOp(environment.createOperation(LiteralOp, truePlace, true));
    functionBuilder.currentBlock.terminal = new ConditionOp(
      createOperationId(environment),
      truePlace,
    );
  });

  const bodyRegion = new Region([]);
  const bodyBlock = environment.createBlock();
  functionBuilder.withStructureRegion(bodyRegion, () => {
    functionBuilder.addBlock(bodyBlock);
    functionBuilder.currentBlock = bodyBlock;
    functionBuilder.controlStack.push({
      kind: "loop",
      label,
      breakTarget: undefined,
      continueTarget: undefined,
      structured: true,
    });
    buildOwnedBody(node.body, scope, functionBuilder, moduleBuilder, environment);

    // if (!test) break;
    const testPlace = buildNode(node.test, scope, functionBuilder, moduleBuilder, environment);
    if (testPlace === undefined || Array.isArray(testPlace)) {
      throw new Error("Do-while statement test must be a single place");
    }
    const notTestPlace = environment.createValue();
    functionBuilder.addOp(
      environment.createOperation(UnaryExpressionOp, notTestPlace, "!", testPlace),
    );

    const consRegion = new Region([]);
    const consBlock = environment.createBlock();
    functionBuilder.withStructureRegion(consRegion, () => {
      functionBuilder.addBlock(consBlock);
      consBlock.terminal = new BreakOp(createOperationId(environment), label);
    });

    const ifOp = new IfOp(createOperationId(environment), notTestPlace, [], consRegion, undefined);
    functionBuilder.currentBlock.appendOp(ifOp);
    functionBuilder.controlStack.pop();

    if (functionBuilder.currentBlock.terminal === undefined) {
      functionBuilder.currentBlock.terminal = new YieldOp(createOperationId(environment), []);
    }
  });

  const whileOp = new WhileOp(createOperationId(environment), beforeRegion, bodyRegion, label);
  parentBlock.appendOp(whileOp);
  functionBuilder.currentBlock = parentBlock;
  return undefined;
}
