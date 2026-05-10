import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../core/IRIdAllocator";
import { makeOperationId } from "../../core/Operation";
import { block, value } from "../../core/testing";
import { globalMemoryLocation, UnknownMemoryLocation } from "../../effects";
import { LoadGlobalOp } from "./LoadGlobalOp";

describe("LoadGlobalOp", () => {
  it("stores its global name and result", () => {
    const result = value(1);
    const op = new LoadGlobalOp(makeOperationId(1), "foo", result);

    expect(op.name).toBe("foo");
    expect(op.result).toBe(result);
    expect(op.operands()).toEqual([]);
  });

  it("updates result definer when attached to a block", () => {
    const result = value(1);
    const op = new LoadGlobalOp(makeOperationId(1), "foo", result);

    block(1).appendOp(op);

    expect(result.definer).toBe(op);
  });

  it("models global access as opaque JavaScript memory", () => {
    const op = new LoadGlobalOp(makeOperationId(1), "foo", value(1));

    expect(op.effects()).toEqual({
      memory: {
        reads: [UnknownMemoryLocation, globalMemoryLocation("foo")],
        writes: [UnknownMemoryLocation],
      },
      mayThrow: true,
      mayDiverge: true,
      isObservable: true,
    });
  });

  it("clones with a fresh id and remapped result", () => {
    const result = value(1);
    const clonedResult = value(2);
    const op = new LoadGlobalOp(makeOperationId(1), "foo", result);
    const clone = op.clone({
      ids: new IRIdAllocator(),
      value: (candidate) => candidate,
      result: (candidate) => {
        if (candidate === result) return clonedResult;
        throw new Error(`Unexpected result ${candidate.id}`);
      },
      block: (candidate) => candidate,
    });

    expect(clone).toBeInstanceOf(LoadGlobalOp);
    expect(clone).not.toBe(op);
    expect(clone.id).not.toBe(op.id);
    expect(clone.name).toBe("foo");
    expect(clone.result).toBe(clonedResult);
  });
});
