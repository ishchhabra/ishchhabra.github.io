import { describe, expect, it } from "vitest";
import { Environment } from "../../environment";
import {
  BinaryExpressionOp,
  BranchTermOp,
  JumpTermOp,
  LiteralOp,
  TPrimitiveValue,
  valueBlockTarget,
} from "../../ir";
import { BasicBlock } from "../../ir/core/Block";
import { FuncOp, makeFuncOpId } from "../../ir/core/FuncOp";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { Value } from "../../ir/core/Value";
import { ProjectEnvironment } from "../../ProjectEnvironment";
import { AnalysisManager } from "./AnalysisManager";
import { ValueFactsAnalysis } from "./ValueFactsAnalysis";

describe("ValueFactsAnalysis", () => {
  it("infers exact constants and numeric facts for number arithmetic", () => {
    const { env, funcOp, block } = createFunction();
    const left = appendLiteral(env, block, 1);
    const right = appendLiteral(env, block, 2);
    const sum = env.createValue();
    block.appendOp(env.createOperation(BinaryExpressionOp, sum, "+", left, right));

    const facts = new AnalysisManager().get(ValueFactsAnalysis, funcOp);

    expect(facts.constant(sum)).toBe(3);
    expect(facts.mustBeNumber(sum)).toBe(true);
  });

  it("models string addition separately from numeric addition", () => {
    const { env, funcOp, block } = createFunction();
    const left = appendLiteral(env, block, "x");
    const right = appendLiteral(env, block, 1);
    const sum = env.createValue();
    block.appendOp(env.createOperation(BinaryExpressionOp, sum, "+", left, right));

    const facts = new AnalysisManager().get(ValueFactsAnalysis, funcOp);

    expect(facts.constant(sum)).toBe("x1");
    expect(facts.mustBeString(sum)).toBe(true);
    expect(facts.mustBeNumber(sum)).toBe(false);
  });

  it("meets block parameters over executable incoming edges only", () => {
    const { env, funcOp, block: entry } = createFunction();
    const thenBlock = env.createBlock();
    const elseBlock = env.createBlock();
    const joinBlock = env.createBlock();
    const joinParam = env.createValue();
    joinBlock.params = [joinParam];
    funcOp.addBlock(thenBlock);
    funcOp.addBlock(elseBlock);
    funcOp.addBlock(joinBlock);

    const cond = appendLiteral(env, entry, true);
    entry.setTerminal(
      env.createOperation(
        BranchTermOp,
        cond,
        valueBlockTarget(thenBlock),
        valueBlockTarget(elseBlock),
      ),
    );

    const thenValue = appendLiteral(env, thenBlock, 1);
    thenBlock.setTerminal(
      env.createOperation(JumpTermOp, valueBlockTarget(joinBlock, [thenValue])),
    );

    const elseValue = appendLiteral(env, elseBlock, "unreachable");
    elseBlock.setTerminal(
      env.createOperation(JumpTermOp, valueBlockTarget(joinBlock, [elseValue])),
    );

    const facts = new AnalysisManager().get(ValueFactsAnalysis, funcOp);

    expect(facts.isExecutable(elseBlock)).toBe(false);
    expect(facts.constant(joinParam)).toBe(1);
    expect(facts.mustBeNumber(joinParam)).toBe(true);
  });
});

function createFunction(): {
  readonly env: Environment;
  readonly funcOp: FuncOp;
  readonly block: BasicBlock;
} {
  const env = new Environment(new ProjectEnvironment());
  const moduleIR = new ModuleIR("m.js", env);
  const block = env.createBlock();
  const funcOp = new FuncOp(moduleIR, makeFuncOpId(env.nextOperationId++), [], false, false, [
    block,
  ]);
  return { env, funcOp, block };
}

function appendLiteral(env: Environment, block: BasicBlock, value: TPrimitiveValue): Value {
  const place = env.createValue();
  block.appendOp(env.createOperation(LiteralOp, place, value));
  return place;
}
