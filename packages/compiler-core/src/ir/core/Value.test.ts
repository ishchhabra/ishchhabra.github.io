import { describe, expect, it } from "vitest";

import { testOp, value } from "./testing";
import { valueUseSites } from "./Value";

describe("Value", () => {
  it("records users as a set", () => {
    const v = value(1);
    const op = testOp(1);

    v._addUser(op);
    v._addUser(op);

    expect([...v.users]).toEqual([op]);
  });

  it("reports repeated operand occurrences as distinct use-sites", () => {
    const v = value(1);
    const op = testOp(1, [v, v]);

    v._addUser(op);

    expect(valueUseSites(v)).toEqual([
      { user: op, operandIndex: 0 },
      { user: op, operandIndex: 1 },
    ]);
  });

  it("removes users", () => {
    const v = value(1);
    const op = testOp(1);

    v._addUser(op);
    v._removeUser(op);

    expect(v.users.size).toBe(0);
  });

  it("allows setting the same definer more than once", () => {
    const v = value(1);
    const op = testOp(1);

    v._setDefiner(op);
    v._setDefiner(op);

    expect(v.definer).toBe(op);
  });

  it("rejects replacing the definer with a different operation", () => {
    const v = value(1);

    v._setDefiner(testOp(1));

    expect(() => v._setDefiner(testOp(2))).toThrow("already has a definer");
  });

  it("clears the current definer", () => {
    const v = value(1);
    const op = testOp(1);

    v._setDefiner(op);
    v._clearDefiner(op);

    expect(v.definer).toBeUndefined();
  });

  it("rejects clearing a mismatched definer", () => {
    const v = value(1);

    v._setDefiner(testOp(1));

    expect(() => v._clearDefiner(testOp(2))).toThrow("Cannot clear definer");
  });
});
