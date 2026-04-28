import { describe, expect, it } from "vitest";
import { Environment } from "../../../environment";
import { ProjectEnvironment } from "../../../ProjectEnvironment";
import {
  AssignmentExpressionOp,
  BinaryExpressionOp,
  LiteralOp,
  LoadStaticPropertyOp,
  ReturnTermOp,
  StoreLocalOp,
  StoreStaticPropertyOp,
} from "../../../ir";
import { FuncOp, makeFuncOpId } from "../../../ir/core/FuncOp";
import { ModuleIR } from "../../../ir/core/ModuleIR";
import { AssignmentExpressionReconstitutionPass } from "./AssignmentExpressionReconstitutionPass";

describe("AssignmentExpressionReconstitutionPass", () => {
  it("allows disjoint local stores between local read and store", () => {
    const { env, funcOp, block } = createSingleBlockFunction();
    const target = env.createValue();
    const other = env.createValue();
    const oldValue = env.createValue();
    const otherValue = env.createValue();
    const one = env.createValue();
    const next = env.createValue();

    block.appendOp(env.createOperation(LiteralOp, oldValue, 1));
    block.appendOp(env.createOperation(StoreLocalOp, env.createValue(), other, otherValue));
    block.appendOp(env.createOperation(LiteralOp, one, 1));
    block.appendOp(env.createOperation(BinaryExpressionOp, next, "+", target, one));
    block.appendOp(env.createOperation(StoreLocalOp, env.createValue(), target, next));
    block.setTerminal(env.createOperation(ReturnTermOp, next));

    const result = new AssignmentExpressionReconstitutionPass(funcOp).run();

    expect(result.changed).toBe(true);
    expect(block.operations.some((op) => op instanceof AssignmentExpressionOp)).toBe(true);
  });

  it("does not move a property read past an intervening local store", () => {
    const { env, funcOp, block } = createSingleBlockFunction();
    const object = env.createValue();
    const oldValue = env.createValue();
    const other = env.createValue();
    const otherValue = env.createValue();
    const one = env.createValue();
    const next = env.createValue();

    block.appendOp(env.createOperation(LoadStaticPropertyOp, oldValue, object, "x"));
    block.appendOp(env.createOperation(StoreLocalOp, env.createValue(), other, otherValue));
    block.appendOp(env.createOperation(LiteralOp, one, 1));
    block.appendOp(env.createOperation(BinaryExpressionOp, next, "+", oldValue, one));
    block.appendOp(
      env.createOperation(StoreStaticPropertyOp, env.createValue(), object, "x", next),
    );
    block.setTerminal(env.createOperation(ReturnTermOp, next));

    const result = new AssignmentExpressionReconstitutionPass(funcOp).run();

    expect(result.changed).toBe(false);
    expect(block.operations.some((op) => op instanceof AssignmentExpressionOp)).toBe(false);
  });
});

function createSingleBlockFunction(): {
  readonly env: Environment;
  readonly funcOp: FuncOp;
  readonly block: ReturnType<Environment["createBlock"]>;
} {
  const env = new Environment(new ProjectEnvironment());
  const moduleIR = new ModuleIR("m.js", env);
  const block = env.createBlock();
  const funcOp = new FuncOp(moduleIR, makeFuncOpId(env.nextOperationId++), [], false, false, [
    block,
  ]);
  return { env, funcOp, block };
}
