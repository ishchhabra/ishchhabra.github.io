import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../core/IRIdAllocator";
import { PureOperationEffects } from "../../effects";
import { block, value } from "../../core/testing";
import { makeOperationId } from "../../core/Operation";
import { ConstantOp } from "./ConstantOp";

describe("ConstantOp", () => {
  it("stores its constant value and result", () => {
    const result = value(1);
    const op = new ConstantOp(makeOperationId(1), 42, result);

    expect(op.value).toBe(42);
    expect(op.result).toBe(result);
    expect(op.operands()).toEqual([]);
  });

  it("has pure effects", () => {
    expect(new ConstantOp(makeOperationId(1), "x", value(1)).effects()).toBe(PureOperationEffects);
  });

  it("updates def-use links when attached to a block", () => {
    const result = value(1);
    const op = new ConstantOp(makeOperationId(1), true, result);

    block(1).appendOp(op);

    expect(result.definer).toBe(op);
  });

  it("clones with a fresh id and remapped result", () => {
    const result = value(1);
    const clonedResult = value(2);
    const op = new ConstantOp(makeOperationId(1), "x", result);

    const clone = op.clone({
      ids: new IRIdAllocator(),
      value: (candidate) => candidate,
      result: (candidate) => {
        if (candidate === result) return clonedResult;
        throw new Error(`Unexpected result ${candidate.id}`);
      },
      block: (candidate) => candidate,
    });

    expect(clone.id).not.toBe(op.id);
    expect(clone.value).toBe("x");
    expect(clone.result).toBe(clonedResult);
  });
});
