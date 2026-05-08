import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../core/IRIdAllocator";
import { makeOperationId } from "../../core/Operation";
import { makeDeclarationId } from "../../core/Value";
import { block, value } from "../../core/testing";
import { bindingMemoryLocation } from "../../effects";
import { LoadBindingOp } from "./LoadBindingOp";

describe("LoadBindingOp", () => {
  it("stores its declaration id and result", () => {
    const declarationId = makeDeclarationId(1);
    const result = value(1);
    const op = new LoadBindingOp(makeOperationId(1), declarationId, result);

    expect(op.declarationId).toBe(declarationId);
    expect(op.result).toBe(result);
    expect(op.bindingValue).toBeNull();
    expect(op.isResolved).toBe(false);
    expect(op.operands()).toEqual([]);
  });

  it("uses the reaching binding value after SSA resolution", () => {
    const declarationId = makeDeclarationId(1);
    const result = value(1);
    const bindingValue = value(2, declarationId);
    const op = new LoadBindingOp(
      makeOperationId(1),
      declarationId,
      result,
      bindingValue,
    );

    expect(op.bindingValue).toBe(bindingValue);
    expect(op.isResolved).toBe(true);
    expect(op.operands()).toEqual([bindingValue]);
  });

  it("updates result definer when attached to a block", () => {
    const result = value(1);
    const op = new LoadBindingOp(makeOperationId(1), makeDeclarationId(1), result);

    block(1).appendOp(op);

    expect(result.definer).toBe(op);
  });

  it("reads binding memory and may throw", () => {
    const declarationId = makeDeclarationId(1);
    const op = new LoadBindingOp(makeOperationId(1), declarationId, value(1));

    expect(op.effects()).toEqual({
      memory: {
        reads: [bindingMemoryLocation(declarationId)],
        writes: [],
      },
      mayThrow: true,
      mayDiverge: false,
      isObservable: false,
    });
  });

  it("returns a resolved copy with replacement binding value", () => {
    const declarationId = makeDeclarationId(1);
    const result = value(1);
    const bindingValue = value(2, declarationId);
    const nextBindingValue = value(3, declarationId);
    const op = new LoadBindingOp(
      makeOperationId(1),
      declarationId,
      result,
      bindingValue,
    );

    const replacement = op.withOperands([nextBindingValue]);

    expect(replacement).not.toBe(op);
    expect(replacement.result).toBe(result);
    expect(replacement.bindingValue).toBe(nextBindingValue);
  });

  it("rejects replacement operands before SSA resolution", () => {
    const op = new LoadBindingOp(
      makeOperationId(1),
      makeDeclarationId(1),
      value(1),
    );

    expect(() => op.withOperands([value(2)])).toThrow("is not SSA-resolved");
  });

  it("clones with a fresh id and remapped result", () => {
    const declarationId = makeDeclarationId(1);
    const result = value(1);
    const clonedResult = value(2);
    const bindingValue = value(3, declarationId);
    const clonedBindingValue = value(4, declarationId);
    const op = new LoadBindingOp(
      makeOperationId(1),
      declarationId,
      result,
      bindingValue,
    );

    const clone = op.clone({
      ids: new IRIdAllocator(),
      value: (candidate) => {
        if (candidate === bindingValue) return clonedBindingValue;
        throw new Error(`Unexpected operand ${candidate.id}`);
      },
      result: (candidate) => {
        if (candidate === result) return clonedResult;
        throw new Error(`Unexpected result ${candidate.id}`);
      },
      block: (candidate) => candidate,
    });

    expect(clone.id).not.toBe(op.id);
    expect(clone.declarationId).toBe(declarationId);
    expect(clone.result).toBe(clonedResult);
    expect(clone.bindingValue).toBe(clonedBindingValue);
  });
});
