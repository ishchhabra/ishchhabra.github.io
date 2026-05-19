import { describe, expect, it } from "vitest";

import { makeBlockId } from "./Block";
import { FunctionIR, makeFunctionId } from "./FunctionIR";
import { block, functionIR, testOp, TestOp, value } from "./testing";
import { makeDeclarationId } from "./Value";

describe("FunctionIR", () => {
  it("rejects a function with no entry block", () => {
    expect(() => new FunctionIR(makeFunctionId(1), { params: [], blocks: [] })).toThrow(
      "must have an entry block",
    );
  });

  it("attaches initial blocks and exposes the first block as entry", () => {
    const entry = block(1);
    const next = block(2);
    const fn = functionIR(1, [entry, next]);

    expect(entry.ownerFunction).toBe(fn);
    expect(next.ownerFunction).toBe(fn);
    expect(fn.entryBlock).toBe(entry);
    expect(fn.blocks).toEqual([entry, next]);
  });

  it("rejects duplicate block ids", () => {
    expect(() => functionIR(1, [block(1), block(1)])).toThrow("already belongs to Function");
  });

  it("rejects adding a block owned by another function", () => {
    const owned = block(1);
    functionIR(1, [owned]);

    expect(() => functionIR(2, [owned])).toThrow("already belongs to another function");
  });

  it("replaces params", () => {
    const fn = functionIR(1);
    const param = {
      kind: "argument" as const,
      target: { kind: "binding" as const, declarationId: makeDeclarationId(1) },
      value: value(1),
    };

    fn.setParams([param]);

    expect(fn.params).toEqual([param]);
  });

  it("maintains use-lists for function-level operands", () => {
    const oldDefault = value(1);
    const nextDefault = value(2);
    const fn = functionIR(1);

    fn.setParams([
      {
        kind: "argument",
        target: {
          kind: "default",
          target: {
            kind: "binding",
            declarationId: makeDeclarationId(1),
          },
          expression: { kind: "value", value: oldDefault },
        },
        value: value(3),
      },
    ]);

    expect(oldDefault.users.has(fn)).toBe(true);

    fn.setParams([
      {
        kind: "argument",
        target: {
          kind: "default",
          target: {
            kind: "binding",
            declarationId: makeDeclarationId(2),
          },
          expression: { kind: "value", value: nextDefault },
        },
        value: value(4),
      },
    ]);

    expect(oldDefault.users.has(fn)).toBe(false);
    expect(nextDefault.users.has(fn)).toBe(true);
  });

  it("removes a non-entry block, clears it, and detaches ownership", () => {
    const entry = block(1);
    const removed = block(2);
    const op = testOp(1);

    removed.appendOp(op);

    const fn = functionIR(1, [entry, removed]);
    fn.removeBlock(removed);

    expect(removed.ownerFunction).toBeNull();
    expect(removed.operations).toEqual([]);
    expect(op.ownerBlock).toBeNull();
    expect(fn.blocks).toEqual([entry]);
  });

  it("rejects removing the entry block", () => {
    const fn = functionIR(1);

    expect(() => fn.removeBlock(fn.entryBlock)).toThrow("Cannot remove entry block");
  });

  it("looks up an owned block by id", () => {
    const entry = block(1);
    const fn = functionIR(1, [entry]);

    expect(fn.getBlock(entry.id)).toBe(entry);
  });

  it("throws when looking up a missing block", () => {
    const fn = functionIR(1);

    expect(() => fn.getBlock(makeBlockId(404))).toThrow("does not belong to Function");
  });
});
