import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../core/IRIdAllocator";
import { makeOperationId } from "../../core/Operation";
import { block, value } from "../../core/testing";
import { UnaryOp } from "./UnaryOp";

describe("UnaryOp", () => {
  it("stores its operator, argument, and result", () => {
    const argument = value(1);
    const result = value(2);
    const op = new UnaryOp(makeOperationId(1), "!", argument, result);

    expect(op.operator).toBe("!");
    expect(op.argument).toBe(argument);
    expect(op.result).toBe(result);
    expect(op.operands()).toEqual([argument]);
  });

  it("updates def-use links when attached to a block", () => {
    const argument = value(1);
    const result = value(2);
    const op = new UnaryOp(makeOperationId(1), "void", argument, result);

    block(1).appendOp(op);

    expect(argument.users.has(op)).toBe(true);
    expect(result.definer).toBe(op);
  });

  it("returns itself when replacement operands are unchanged", () => {
    const argument = value(1);
    const op = new UnaryOp(makeOperationId(1), "~", argument, value(2));

    expect(op.withOperands([argument])).toBe(op);
  });

  it("returns a same-result copy with a replacement operand", () => {
    const result = value(2);
    const op = new UnaryOp(makeOperationId(1), "+", value(1), result);
    const nextArgument = value(3);
    const replacement = op.withOperands([nextArgument]);

    expect(replacement).not.toBe(op);
    expect(replacement.id).toBe(op.id);
    expect(replacement.operator).toBe("+");
    expect(replacement.argument).toBe(nextArgument);
    expect(replacement.result).toBe(result);
  });

  it("rejects replacement operands with the wrong arity", () => {
    const op = new UnaryOp(makeOperationId(1), "-", value(1), value(2));

    expect(() => op.withOperands([])).toThrow("expected 1 operand, got 0");
  });

  it("clones with fresh ids and remapped values", () => {
    const argument = value(1);
    const result = value(2);
    const clonedArgument = value(3);
    const clonedResult = value(4);
    const op = new UnaryOp(makeOperationId(1), "typeof", argument, result);

    const clone = op.clone({
      ids: new IRIdAllocator(),
      value: (candidate) => {
        if (candidate === argument) return clonedArgument;
        throw new Error(`Unexpected operand ${candidate.id}`);
      },
      result: (candidate) => {
        if (candidate === result) return clonedResult;
        throw new Error(`Unexpected result ${candidate.id}`);
      },
      block: (candidate) => candidate,
    });

    expect(clone.id).not.toBe(op.id);
    expect(clone.operator).toBe("typeof");
    expect(clone.argument).toBe(clonedArgument);
    expect(clone.result).toBe(clonedResult);
  });
});
