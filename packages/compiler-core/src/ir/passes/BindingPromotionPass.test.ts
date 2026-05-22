import { describe, expect, it } from "vitest";

import { AnalysisManager } from "../analysis";
import { BasicBlock } from "../core/Block";
import { FunctionIR } from "../core/FunctionIR";
import { IRIdAllocator } from "../core/IRIdAllocator";
import { ModuleIR } from "../core/ModuleIR";
import { blockTarget } from "../core/TerminatorOp";
import { type DeclarationId, Value } from "../core/Value";
import { InitializeBindingOp } from "../ops/bindings/InitializeBindingOp";
import { LoadBindingOp } from "../ops/bindings/LoadBindingOp";
import { StoreBindingOp } from "../ops/bindings/StoreBindingOp";
import { ConstantOp } from "../ops/constants/ConstantOp";
import { BranchTerminatorOp } from "../ops/control/BranchTerminatorOp";
import { JumpTerminatorOp } from "../ops/control/JumpTerminatorOp";
import { ReturnTerminatorOp } from "../ops/control/ReturnTerminatorOp";
import { createBindingPromotionPass } from "./BindingPromotionPass";
import { createSSAConstructionPass } from "./ssa/SSAConstructionPass";

describe("BindingPromotionPass", () => {
  it("promotes straight-line binding loads and writes", () => {
    const ids = new IRIdAllocator();
    const declaration = ids.declarationId();
    const entry = block(ids);
    const initialValue = value(ids);
    const initialBindingValue = value(ids, declaration);
    const loadResult = value(ids);

    entry.appendOp(new ConstantOp(ids.operationId(), 1, initialValue));
    entry.appendOp(
      new InitializeBindingOp(ids.operationId(), declaration, initialValue, initialBindingValue),
    );
    entry.appendOp(new LoadBindingOp(ids.operationId(), declaration, loadResult));
    entry.setTerminator(new ReturnTerminatorOp(ids.operationId(), loadResult));

    const { fn } = moduleFunction(ids, [entry]);

    runPromotion(ids, fn);

    expect(entry.operations.some(isBindingOperation)).toBe(false);
    expect((entry.terminator as ReturnTerminatorOp).value).toBe(initialValue);
  });

  it("promotes binding joins through SSA block parameters", () => {
    const ids = new IRIdAllocator();
    const declaration = ids.declarationId();
    const entry = block(ids);
    const thenBlock = block(ids);
    const join = block(ids);
    const condition = value(ids);
    const initialValue = value(ids);
    const initialBindingValue = value(ids, declaration);
    const updatedValue = value(ids);
    const updatedBindingValue = value(ids, declaration);
    const loadResult = value(ids);

    entry.appendOp(new ConstantOp(ids.operationId(), true, condition));
    entry.appendOp(new ConstantOp(ids.operationId(), 1, initialValue));
    entry.appendOp(
      new InitializeBindingOp(ids.operationId(), declaration, initialValue, initialBindingValue),
    );
    entry.setTerminator(
      new BranchTerminatorOp(
        ids.operationId(),
        condition,
        blockTarget(thenBlock),
        blockTarget(join),
      ),
    );

    thenBlock.appendOp(new ConstantOp(ids.operationId(), 2, updatedValue));
    thenBlock.appendOp(
      new StoreBindingOp(ids.operationId(), declaration, updatedValue, updatedBindingValue),
    );
    thenBlock.setTerminator(new JumpTerminatorOp(ids.operationId(), blockTarget(join)));

    join.appendOp(new LoadBindingOp(ids.operationId(), declaration, loadResult));
    join.setTerminator(new ReturnTerminatorOp(ids.operationId(), loadResult));

    const { fn } = moduleFunction(ids, [entry, thenBlock, join]);

    runPromotion(ids, fn);

    const branch = entry.terminator as BranchTerminatorOp;
    const jump = thenBlock.terminator as JumpTerminatorOp;

    expect(entry.operations.some(isBindingOperation)).toBe(false);
    expect(thenBlock.operations.some(isBindingOperation)).toBe(false);
    expect(join.operations.some(isBindingOperation)).toBe(false);
    expect(join.params).toHaveLength(1);
    expect(branch.falseTarget.operands.forwarded).toEqual([initialValue]);
    expect(jump.jumpTarget.operands.forwarded).toEqual([updatedValue]);
    expect((join.terminator as ReturnTerminatorOp).value).toBe(join.params[0]);
  });

  it("keeps exported bindings materialized", () => {
    const ids = new IRIdAllocator();
    const declaration = ids.declarationId();
    const entry = block(ids);
    const initialValue = value(ids);
    const initialBindingValue = value(ids, declaration);
    const loadResult = value(ids);

    entry.appendOp(new ConstantOp(ids.operationId(), 1, initialValue));
    entry.appendOp(
      new InitializeBindingOp(ids.operationId(), declaration, initialValue, initialBindingValue),
    );
    entry.appendOp(new LoadBindingOp(ids.operationId(), declaration, loadResult));
    entry.setTerminator(new ReturnTerminatorOp(ids.operationId(), loadResult));

    const { fn, moduleIR } = moduleFunction(ids, [entry]);
    moduleIR.addExport({
      kind: "local",
      localName: "x",
      exportedName: { kind: "identifier", name: "x" },
      declarationId: declaration,
    });

    runPromotion(ids, fn);

    expect(entry.operations.some(isBindingOperation)).toBe(true);
    expect((entry.terminator as ReturnTerminatorOp).value).toBe(loadResult);
  });

  it("keeps captured bindings materialized", () => {
    const ids = new IRIdAllocator();
    const declaration = ids.declarationId();
    const entry = block(ids);
    const initialValue = value(ids);
    const initialBindingValue = value(ids, declaration);
    const loadResult = value(ids);

    entry.appendOp(new ConstantOp(ids.operationId(), 1, initialValue));
    entry.appendOp(
      new InitializeBindingOp(ids.operationId(), declaration, initialValue, initialBindingValue),
    );
    entry.appendOp(new LoadBindingOp(ids.operationId(), declaration, loadResult));
    entry.setTerminator(new ReturnTerminatorOp(ids.operationId(), loadResult));

    const { fn, moduleIR } = moduleFunction(ids, [entry]);
    moduleIR.addFunction(
      new FunctionIR(ids.functionId(), {
        params: [{ kind: "capture", declarationId: declaration }],
        blocks: [block(ids)],
      }),
    );

    runPromotion(ids, fn);

    expect(entry.operations.some(isBindingOperation)).toBe(true);
    expect((entry.terminator as ReturnTerminatorOp).value).toBe(loadResult);
  });
});

function runPromotion(ids: IRIdAllocator, fn: FunctionIR): void {
  const analyses = new AnalysisManager();

  createSSAConstructionPass({ ids }).run(fn, analyses);
  createBindingPromotionPass().run(fn, analyses);
}

function moduleFunction(
  ids: IRIdAllocator,
  blocks: readonly BasicBlock[],
): { readonly moduleIR: ModuleIR; readonly fn: FunctionIR } {
  const moduleIR = new ModuleIR(ids.moduleId());
  const fn = new FunctionIR(ids.functionId(), { params: [], blocks });

  moduleIR.addFunction(fn);
  moduleIR.setEntryFunction(fn);

  return { moduleIR, fn };
}

function isBindingOperation(op: unknown): boolean {
  return (
    op instanceof InitializeBindingOp || op instanceof LoadBindingOp || op instanceof StoreBindingOp
  );
}

function block(ids: IRIdAllocator): BasicBlock {
  return new BasicBlock(ids.blockId());
}

function value(ids: IRIdAllocator, declarationId: DeclarationId | null = null): Value {
  return new Value(ids.valueId(), declarationId);
}
