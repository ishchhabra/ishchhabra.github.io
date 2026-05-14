import { describe, expect, it } from "vitest";

import { AnalysisManager } from "../analysis";
import { BasicBlock, makeBlockId } from "../core/Block";
import { FunctionIR, makeFunctionId } from "../core/FunctionIR";
import { IRIdAllocator } from "../core/IRIdAllocator";
import { blockTarget } from "../core/TerminatorOp";
import { makeDeclarationId, type DeclarationId, Value } from "../core/Value";
import { InitializeBindingOp } from "../ops/bindings/InitializeBindingOp";
import { LoadBindingOp } from "../ops/bindings/LoadBindingOp";
import { StoreBindingOp } from "../ops/bindings/StoreBindingOp";
import { BranchTerminatorOp } from "../ops/control/BranchTerminatorOp";
import { JumpTerminatorOp } from "../ops/control/JumpTerminatorOp";
import { ReturnTerminatorOp } from "../ops/control/ReturnTerminatorOp";
import { createBindingPromotionPass } from "./BindingPromotionPass";

describe("BindingPromotionPass", () => {
  it("removes straight-line binding loads and writes", () => {
    const ids = new IRIdAllocator();
    const declaration = makeDeclarationId(1);
    const entry = block(1);
    const initial = value(ids, declaration);
    const loaded = value(ids);

    entry.appendOp(
      new InitializeBindingOp(ids.operationId(), declaration, initial, value(ids, declaration)),
    );
    entry.appendOp(new LoadBindingOp(ids.operationId(), declaration, loaded));
    entry.setTerminator(new ReturnTerminatorOp(ids.operationId(), loaded));

    const fn = functionIR(entry);

    createBindingPromotionPass({ ids, declarations: [declaration] }).run(fn, new AnalysisManager());

    expect(entry.operations.map((op) => op.constructor.name)).toEqual(["ReturnTerminatorOp"]);
    expect((entry.terminator as ReturnTerminatorOp).value).toBe(initial);
  });

  it("uses block params for values merged from multiple predecessors", () => {
    const ids = new IRIdAllocator();
    const declaration = makeDeclarationId(1);
    const entry = block(1);
    const thenBlock = block(2);
    const elseBlock = block(3);
    const joinBlock = block(4);
    const condition = value(ids);
    const initial = value(ids, declaration);
    const thenValue = value(ids, declaration);
    const elseValue = value(ids, declaration);
    const loaded = value(ids);

    entry.appendOp(
      new InitializeBindingOp(ids.operationId(), declaration, initial, value(ids, declaration)),
    );
    entry.setTerminator(
      new BranchTerminatorOp(
        ids.operationId(),
        condition,
        blockTarget(thenBlock),
        blockTarget(elseBlock),
      ),
    );

    thenBlock.appendOp(
      new StoreBindingOp(ids.operationId(), declaration, thenValue, value(ids, declaration)),
    );
    thenBlock.setTerminator(new JumpTerminatorOp(ids.operationId(), blockTarget(joinBlock)));

    elseBlock.appendOp(
      new StoreBindingOp(ids.operationId(), declaration, elseValue, value(ids, declaration)),
    );
    elseBlock.setTerminator(new JumpTerminatorOp(ids.operationId(), blockTarget(joinBlock)));

    joinBlock.appendOp(new LoadBindingOp(ids.operationId(), declaration, loaded));
    joinBlock.setTerminator(new ReturnTerminatorOp(ids.operationId(), loaded));

    const fn = functionIR(entry, thenBlock, elseBlock, joinBlock);

    createBindingPromotionPass({ ids, declarations: [declaration] }).run(fn, new AnalysisManager());

    expect(joinBlock.params).toHaveLength(1);
    expect(joinBlock.params[0].declarationId).toBe(declaration);
    expect((thenBlock.terminator as JumpTerminatorOp).jumpTarget.operands.forwarded).toEqual([
      thenValue,
    ]);
    expect((elseBlock.terminator as JumpTerminatorOp).jumpTarget.operands.forwarded).toEqual([
      elseValue,
    ]);
    expect((joinBlock.terminator as ReturnTerminatorOp).value).toBe(joinBlock.params[0]);
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
