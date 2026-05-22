import { describe, expect, it } from "vitest";

import { AnalysisManager } from "../../analysis";
import { BasicBlock, makeBlockId } from "../../core/Block";
import { FunctionIR, makeFunctionId } from "../../core/FunctionIR";
import { IRIdAllocator } from "../../core/IRIdAllocator";
import { blockTarget } from "../../core/TerminatorOp";
import { makeDeclarationId, type DeclarationId, Value } from "../../core/Value";
import { BranchTerminatorOp } from "../../ops/control/BranchTerminatorOp";
import { JumpTerminatorOp } from "../../ops/control/JumpTerminatorOp";
import { ReturnTerminatorOp } from "../../ops/control/ReturnTerminatorOp";
import { CopyValueOp } from "../../ops/values/CopyValueOp";
import { createSSAEliminationPass } from "./SSAEliminationPass";

describe("SSAEliminationPass", () => {
  it("materializes direct jump edge args as copies", () => {
    const ids = new IRIdAllocator();
    const declaration = makeDeclarationId(1);
    const entry = block(1);
    const join = block(2);
    const source = value(ids, declaration);
    const param = value(ids, declaration);

    join.appendParam(param);
    entry.setTerminator(new JumpTerminatorOp(ids.operationId(), blockTarget(join, [source])));
    join.setTerminator(new ReturnTerminatorOp(ids.operationId(), param));

    const fn = functionIR(entry, join);

    createSSAEliminationPass({ ids }).run(fn, new AnalysisManager());

    expect(entry.operations[0]).toBeInstanceOf(CopyValueOp);
    expect((entry.operations[0] as CopyValueOp).target).toBe(param);
    expect((entry.operations[0] as CopyValueOp).source).toBe(source);
    expect((entry.terminator as JumpTerminatorOp).jumpTarget.operands.forwarded).toEqual([]);
    expect(join.params).toEqual([]);
  });

  it("splits conditional edges before inserting copies", () => {
    const ids = new IRIdAllocator();
    const declaration = makeDeclarationId(1);
    const entry = block(10);
    const thenBlock = block(11);
    const elseBlock = block(12);
    const condition = value(ids);
    const trueSource = value(ids, declaration);
    const falseSource = value(ids, declaration);
    const trueParam = value(ids, declaration);
    const falseParam = value(ids, declaration);

    thenBlock.appendParam(trueParam);
    elseBlock.appendParam(falseParam);
    entry.setTerminator(
      new BranchTerminatorOp(
        ids.operationId(),
        condition,
        blockTarget(thenBlock, [trueSource]),
        blockTarget(elseBlock, [falseSource]),
      ),
    );
    thenBlock.setTerminator(new ReturnTerminatorOp(ids.operationId(), trueParam));
    elseBlock.setTerminator(new ReturnTerminatorOp(ids.operationId(), falseParam));

    const fn = functionIR(entry, thenBlock, elseBlock);

    createSSAEliminationPass({ ids }).run(fn, new AnalysisManager());

    const branch = entry.terminator as BranchTerminatorOp;
    const trueEdge = branch.trueBlock;
    const falseEdge = branch.falseBlock;

    expect(trueEdge).not.toBe(thenBlock);
    expect(falseEdge).not.toBe(elseBlock);
    expect(trueEdge.kind).toBe("copy");
    expect(falseEdge.kind).toBe("copy");
    expect(trueEdge.operations[0]).toBeInstanceOf(CopyValueOp);
    expect(falseEdge.operations[0]).toBeInstanceOf(CopyValueOp);
    expect((trueEdge.operations[0] as CopyValueOp).source).toBe(trueSource);
    expect((falseEdge.operations[0] as CopyValueOp).source).toBe(falseSource);
    expect((trueEdge.terminator as JumpTerminatorOp).targetBlock).toBe(thenBlock);
    expect((falseEdge.terminator as JumpTerminatorOp).targetBlock).toBe(elseBlock);
    expect(thenBlock.params).toEqual([]);
    expect(elseBlock.params).toEqual([]);
  });

  it("preserves produced edge operands while eliminating forwarded params", () => {
    const ids = new IRIdAllocator();
    const declaration = makeDeclarationId(1);
    const entry = block(1);
    const join = block(2);
    const condition = value(ids);
    const producedSource = value(ids);
    const forwardedSource = value(ids, declaration);
    const producedParam = value(ids);
    const forwardedParam = value(ids, declaration);

    join.appendParam(producedParam);
    join.appendParam(forwardedParam);
    entry.setTerminator(
      new JumpTerminatorOp(ids.operationId(), {
        block: join,
        operands: {
          produced: [producedSource],
          forwarded: [forwardedSource],
        },
      }),
    );
    join.setTerminator(new ReturnTerminatorOp(ids.operationId(), forwardedParam));

    const fn = functionIR(entry, join);

    createSSAEliminationPass({ ids }).run(fn, new AnalysisManager());

    const jumpTarget = (entry.terminator as JumpTerminatorOp).jumpTarget;

    expect(jumpTarget.operands.produced).toEqual([producedSource]);
    expect(jumpTarget.operands.forwarded).toEqual([]);
    expect(join.params).toEqual([producedParam]);
  });

  it("preserves produced declaration params", () => {
    const ids = new IRIdAllocator();
    const declaration = makeDeclarationId(1);
    const entry = block(1);
    const join = block(2);
    const producedSource = value(ids, declaration);
    const producedParam = value(ids, declaration);

    join.appendParam(producedParam);
    entry.setTerminator(
      new JumpTerminatorOp(ids.operationId(), {
        block: join,
        operands: {
          produced: [producedSource],
          forwarded: [],
        },
      }),
    );
    join.setTerminator(new ReturnTerminatorOp(ids.operationId(), producedParam));

    const fn = functionIR(entry, join);

    createSSAEliminationPass({ ids }).run(fn, new AnalysisManager());

    const jumpTarget = (entry.terminator as JumpTerminatorOp).jumpTarget;

    expect(entry.operations).toHaveLength(1);
    expect(jumpTarget.operands.produced).toEqual([producedSource]);
    expect(jumpTarget.operands.forwarded).toEqual([]);
    expect(join.params).toEqual([producedParam]);
  });
});

function block(id: number): BasicBlock {
  return new BasicBlock(makeBlockId(id));
}

function functionIR(entry: BasicBlock, ...blocks: BasicBlock[]): FunctionIR {
  return new FunctionIR(makeFunctionId(1), {
    params: [],
    blocks: [entry, ...blocks],
  });
}

function value(ids: IRIdAllocator, declarationId: DeclarationId | null = null): Value {
  return new Value(ids.valueId(), declarationId);
}
