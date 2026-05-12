import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../core/IRIdAllocator";
import { makeOperationId } from "../../core/Operation";
import { block, value } from "../../core/testing";
import { UnknownOperationEffects } from "../../effects";
import { CallOp } from "./CallOp";

describe("CallOp", () => {
  it("stores its value target, arguments, and result", () => {
    const callee = value(1);
    const arg = value(2);
    const result = value(3);
    const op = new CallOp(
      makeOperationId(1),
      { kind: "value", callee },
      [{ kind: "value", value: arg }],
      result,
    );

    expect(op.target).toEqual({ kind: "value", callee });
    expect(op.args).toEqual([{ kind: "value", value: arg }]);
    expect(op.result).toBe(result);
    expect(op.operands()).toEqual([callee, arg]);
  });

  it("stores property targets without materializing a detached callee", () => {
    const object = value(1);
    const arg = value(2);
    const result = value(3);
    const op = new CallOp(
      makeOperationId(1),
      { kind: "property", object, key: { kind: "static", name: "method" } },
      [{ kind: "value", value: arg }],
      result,
    );

    expect(op.operands()).toEqual([object, arg]);
  });

  it("stores value-with-receiver targets in operand order", () => {
    const callee = value(1);
    const receiver = value(2);
    const arg = value(3);
    const result = value(4);
    const op = new CallOp(
      makeOperationId(1),
      { kind: "value-with-receiver", callee, receiver },
      [{ kind: "value", value: arg }],
      result,
    );

    expect(op.operands()).toEqual([callee, receiver, arg]);
  });

  it("includes computed property keys in operand order", () => {
    const object = value(1);
    const key = value(2);
    const arg = value(3);
    const op = new CallOp(
      makeOperationId(1),
      { kind: "property", object, key: { kind: "computed", value: key } },
      [{ kind: "value", value: arg }],
      value(4),
    );

    expect(op.operands()).toEqual([object, key, arg]);
  });

  it("updates def-use links when attached to a block", () => {
    const callee = value(1);
    const arg = value(2);
    const result = value(3);
    const op = new CallOp(
      makeOperationId(1),
      { kind: "value", callee },
      [{ kind: "value", value: arg }],
      result,
    );

    block(1).appendOp(op);

    expect(callee.users.has(op)).toBe(true);
    expect(arg.users.has(op)).toBe(true);
    expect(result.definer).toBe(op);
  });

  it("uses conservative unknown effects", () => {
    expect(
      new CallOp(makeOperationId(1), { kind: "value", callee: value(1) }, [], value(2)).effects(),
    ).toBe(UnknownOperationEffects);
  });

  it("returns itself when replacement operands are unchanged", () => {
    const callee = value(1);
    const arg = value(2);
    const op = new CallOp(
      makeOperationId(1),
      { kind: "value", callee },
      [{ kind: "value", value: arg }],
      value(3),
    );

    expect(op.withOperands([callee, arg])).toBe(op);
  });

  it("returns a same-result copy with replacement operands", () => {
    const result = value(3);
    const op = new CallOp(
      makeOperationId(1),
      { kind: "value", callee: value(1) },
      [{ kind: "value", value: value(2) }],
      result,
    );
    const nextCallee = value(4);
    const nextArg = value(5);
    const replacement = op.withOperands([nextCallee, nextArg]);

    expect(replacement).toBeInstanceOf(CallOp);
    expect(replacement).not.toBe(op);
    expect(replacement.id).toBe(op.id);
    expect(replacement.target).toEqual({
      kind: "value",
      callee: nextCallee,
    });
    expect(replacement.args).toEqual([{ kind: "value", value: nextArg }]);
    expect(replacement.result).toBe(result);
  });

  it("replaces value-with-receiver target operands", () => {
    const result = value(4);
    const op = new CallOp(
      makeOperationId(1),
      {
        kind: "value-with-receiver",
        callee: value(1),
        receiver: value(2),
      },
      [{ kind: "value", value: value(3) }],
      result,
    );
    const nextCallee = value(5);
    const nextReceiver = value(6);
    const nextArg = value(7);
    const replacement = op.withOperands([nextCallee, nextReceiver, nextArg]);

    expect(replacement.target).toEqual({
      kind: "value-with-receiver",
      callee: nextCallee,
      receiver: nextReceiver,
    });
    expect(replacement.args).toEqual([{ kind: "value", value: nextArg }]);
    expect(replacement.result).toBe(result);
  });

  it("rejects replacement operands with the wrong arity", () => {
    const op = new CallOp(
      makeOperationId(1),
      { kind: "value", callee: value(1) },
      [{ kind: "value", value: value(2) }],
      value(3),
    );

    expect(() => op.withOperands([value(4)])).toThrow("expected 2 operands, got 1");
  });

  it("clones with fresh ids and remapped values", () => {
    const callee = value(1);
    const arg = value(2);
    const result = value(3);
    const clonedCallee = value(4);
    const clonedArg = value(5);
    const clonedResult = value(6);
    const op = new CallOp(
      makeOperationId(1),
      { kind: "value", callee },
      [{ kind: "value", value: arg }],
      result,
    );
    const clone = op.clone({
      ids: new IRIdAllocator(),
      value: (candidate) => {
        if (candidate === callee) return clonedCallee;
        if (candidate === arg) return clonedArg;
        throw new Error(`Unexpected operand ${candidate.id}`);
      },
      result: (candidate) => {
        if (candidate === result) return clonedResult;
        throw new Error(`Unexpected result ${candidate.id}`);
      },
      block: (candidate) => candidate,
    });

    expect(clone).toBeInstanceOf(CallOp);
    expect(clone).not.toBe(op);
    expect(clone.id).not.toBe(op.id);
    expect(clone.target).toEqual({
      kind: "value",
      callee: clonedCallee,
    });
    expect(clone.args).toEqual([{ kind: "value", value: clonedArg }]);
    expect(clone.result).toBe(clonedResult);
  });
});
