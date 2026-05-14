import { describe, expect, it } from "vitest";

import { UnknownOperationEffects } from "../effects";
import { IRIdAllocator } from "./IRIdAllocator";
import type { OperationCloneContext } from "./OperationCloneContext";
import { block, testOp, value } from "./testing";

describe("Operation", () => {
  it("attaches to a block and updates def-use links", () => {
    const operand = value(1);
    const result = value(2);
    const owner = block(1);
    const op = testOp(1, [operand], [result]);

    op.attach(owner);

    expect(op.ownerBlock).toBe(owner);
    expect(operand.users.has(op)).toBe(true);
    expect(result.definer).toBe(op);
  });

  it("rejects double attach", () => {
    const owner = block(1);
    const op = testOp(1);

    op.attach(owner);

    expect(() => op.attach(owner)).toThrow("already attached");
  });

  it("detaches from a block and updates def-use links", () => {
    const operand = value(1);
    const result = value(2);
    const owner = block(1);
    const op = testOp(1, [operand], [result]);

    op.attach(owner);
    op.detach();

    expect(op.ownerBlock).toBeNull();
    expect(operand.users.has(op)).toBe(false);
    expect(result.definer).toBeUndefined();
  });

  it("rejects detach when already detached", () => {
    expect(() => testOp(1).detach()).toThrow("is not attached");
  });

  it("returns the only result", () => {
    const result = value(1);
    const op = testOp(1, [], [result]);

    expect(op.result).toBe(result);
  });

  it("rejects result access for zero or multiple results", () => {
    expect(() => testOp(1).result).toThrow("expected 1");
    expect(() => testOp(2, [], [value(1), value(2)]).result).toThrow("expected 1");
  });

  it("uses conservative effects by default", () => {
    expect(testOp(1).effects()).toBe(UnknownOperationEffects);
  });

  it("returns itself when replacement operands are unchanged", () => {
    const operand = value(1);
    const op = testOp(1, [operand]);

    expect(op.withOperands([operand])).toBe(op);
  });

  it("rejects unsupported operand replacement", () => {
    const op = testOp(1, [value(1)]);

    expect(() => op.withOperands([value(2)])).toThrow("does not support operand replacement");
  });

  it("rejects operand replacement with the wrong arity", () => {
    expect(() => testOp(1, [value(1)]).withOperands([])).toThrow("expected 1 operands, got 0");
  });

  it("rejects cloning by default", () => {
    const op = testOp(1);
    const owner = block(1);
    const context: OperationCloneContext = {
      ids: new IRIdAllocator(),
      value: (candidate) => candidate,
      result: (candidate) => candidate,
      block: () => owner,
    };

    expect(() => op.clone(context)).toThrow("does not support cloning");
  });

  it("verifies valid operation-local invariants", () => {
    expect(() => testOp(1, [value(1)], [value(2)]).verify()).not.toThrow();
  });
});
