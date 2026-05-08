import { describe, expect, it } from "vitest";
import { block, value } from "../../core/testing";
import { makeOperationId } from "../../core/Operation";
import { IRIdAllocator } from "../../core/IRIdAllocator";
import { BinaryOp } from "./BinaryOp";

describe("BinaryOp", () => {
  it("stores its operator, operands, and result", () => {
    const left = value(1);
    const right = value(2);
    const result = value(3);
    const op = new BinaryOp(makeOperationId(1), "+", left, right, result);

    expect(op.operator).toBe("+");
    expect(op.left).toBe(left);
    expect(op.right).toBe(right);
    expect(op.result).toBe(result);
    expect(op.operands()).toEqual([left, right]);
  });

  it("updates def-use links when attached to a block", () => {
    const left = value(1);
    const right = value(2);
    const result = value(3);
    const owner = block(1);
    const op = new BinaryOp(makeOperationId(1), "*", left, right, result);

    owner.appendOp(op);

    expect(left.users.has(op)).toBe(true);
    expect(right.users.has(op)).toBe(true);
    expect(result.definer).toBe(op);
  });

  it("returns itself when replacement operands are unchanged", () => {
    const left = value(1);
    const right = value(2);
    const op = new BinaryOp(makeOperationId(1), "+", left, right, value(3));

    expect(op.withOperands([left, right])).toBe(op);
  });

  it("returns a same-result copy with replacement operands", () => {
    const result = value(3);
    const op = new BinaryOp(makeOperationId(1), "+", value(1), value(2), result);
    const nextLeft = value(4);
    const nextRight = value(5);
    const replacement = op.withOperands([nextLeft, nextRight]);

    expect(replacement).toBeInstanceOf(BinaryOp);
    expect(replacement).not.toBe(op);
    expect(replacement.id).toBe(op.id);
    expect(replacement.operator).toBe("+");
    expect(replacement.left).toBe(nextLeft);
    expect(replacement.right).toBe(nextRight);
    expect(replacement.result).toBe(result);
  });

  it("rejects replacement operands with the wrong arity", () => {
    const op = new BinaryOp(makeOperationId(1), "+", value(1), value(2), value(3));

    expect(() => op.withOperands([value(4)])).toThrow("expected 2 operands, got 1");
  });

  it("clones with fresh ids and remapped values", () => {
    const left = value(1);
    const right = value(2);
    const result = value(3);
    const clonedLeft = value(4);
    const clonedRight = value(5);
    const clonedResult = value(6);
    const op = new BinaryOp(makeOperationId(1), "*", left, right, result);
    const clone = op.clone({
      ids: new IRIdAllocator(),
      value: (candidate) => {
        if (candidate === left) return clonedLeft;
        if (candidate === right) return clonedRight;
        throw new Error(`Unexpected operand ${candidate.id}`);
      },
      result: (candidate) => {
        if (candidate === result) return clonedResult;
        throw new Error(`Unexpected result ${candidate.id}`);
      },
      block: (candidate) => candidate,
    });

    expect(clone).toBeInstanceOf(BinaryOp);
    expect(clone).not.toBe(op);
    expect(clone.id).not.toBe(op.id);
    expect(clone.operator).toBe("*");
    expect(clone.left).toBe(clonedLeft);
    expect(clone.right).toBe(clonedRight);
    expect(clone.result).toBe(clonedResult);
  });
});
