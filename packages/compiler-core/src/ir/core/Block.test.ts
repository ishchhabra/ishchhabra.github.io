import { describe, expect, it } from "vitest";
import { blockTarget } from "./TerminatorOp";
import { block, testOp, testTerminatorOp, value } from "./testing";

describe("BasicBlock", () => {
  it("manages block params", () => {
    const bb = block(1);
    const first = value(1);
    const second = value(2);

    bb.appendParam(first);
    bb.setParams([first, second]);

    expect(bb.params).toEqual([first, second]);
    expect(bb.removeParam(0)).toBe(first);
    expect(bb.params).toEqual([second]);

    bb.clearParams();

    expect(bb.params).toEqual([]);
  });

  it("rejects removing a missing param", () => {
    expect(() => block(1).removeParam(0)).toThrow("has no parameter");
  });

  it("appends and inserts non-terminator operations in program order", () => {
    const bb = block(1);
    const first = testOp(1);
    const second = testOp(2);
    const inserted = testOp(3);

    bb.appendOp(first);
    bb.appendOp(second);
    bb.insertOp(1, inserted);

    expect(bb.operations).toEqual([first, inserted, second]);
    expect(first.ownerBlock).toBe(bb);
    expect(second.ownerBlock).toBe(bb);
    expect(inserted.ownerBlock).toBe(bb);
  });

  it("rejects appending a terminator through appendOp", () => {
    const bb = block(1);
    const terminator = testTerminatorOp(1, [blockTarget(block(2))]);

    expect(() => bb.appendOp(terminator)).toThrow("Use setTerminator");
  });

  it("rejects inserting a terminator through insertOp", () => {
    const bb = block(1);
    const terminator = testTerminatorOp(1, [blockTarget(block(2))]);

    expect(() => bb.insertOp(0, terminator)).toThrow("Use setTerminator");
  });

  it("rejects appending after a terminator", () => {
    const bb = block(1);

    bb.setTerminator(testTerminatorOp(1, [blockTarget(block(2))]));

    expect(() => bb.appendOp(testOp(2))).toThrow("after terminator");
  });

  it("rejects inserting after a terminator", () => {
    const bb = block(1);

    bb.appendOp(testOp(1));
    bb.setTerminator(testTerminatorOp(2, [blockTarget(block(2))]));

    expect(() => bb.insertOp(2, testOp(3))).toThrow("expected 0..1");
  });

  it("installs a terminator as the final operation", () => {
    const bb = block(1);
    const terminator = testTerminatorOp(1, [blockTarget(block(2))]);

    bb.setTerminator(terminator);

    expect(bb.terminator).toBe(terminator);
    expect(bb.isTerminated).toBe(true);
    expect(bb.operations).toEqual([terminator]);
    expect(terminator.ownerBlock).toBe(bb);
  });

  it("rejects a second terminator", () => {
    const bb = block(1);

    bb.setTerminator(testTerminatorOp(1, [blockTarget(block(2))]));

    expect(() => bb.setTerminator(testTerminatorOp(2, [blockTarget(block(3))]))).toThrow(
      "already has a terminator",
    );
  });

  it("replaces a non-terminator operation", () => {
    const bb = block(1);
    const oldOp = testOp(1);
    const newOp = testOp(2);

    bb.appendOp(oldOp);
    bb.replaceOp(oldOp, newOp);

    expect(bb.operations).toEqual([newOp]);
    expect(oldOp.ownerBlock).toBeNull();
    expect(newOp.ownerBlock).toBe(bb);
  });

  it("replaces a terminator operation", () => {
    const bb = block(1);
    const oldTerminator = testTerminatorOp(1, [blockTarget(block(2))]);
    const newTerminator = testTerminatorOp(2, [blockTarget(block(3))]);

    bb.setTerminator(oldTerminator);
    bb.replaceOp(oldTerminator, newTerminator);

    expect(bb.terminator).toBe(newTerminator);
    expect(oldTerminator.ownerBlock).toBeNull();
    expect(newTerminator.ownerBlock).toBe(bb);
  });

  it("rejects replacing terminator with non-terminator or vice versa", () => {
    const bb = block(1);
    const op = testOp(1);
    const terminator = testTerminatorOp(2, [blockTarget(block(2))]);

    bb.appendOp(op);

    expect(() => bb.replaceOp(op, terminator)).toThrow("Cannot replace a terminator");
  });

  it("removes an owned operation and detaches it", () => {
    const bb = block(1);
    const op = testOp(1);

    bb.appendOp(op);

    expect(bb.removeOp(op)).toBe(op);
    expect(op.ownerBlock).toBeNull();
    expect(bb.operations).toEqual([]);
  });

  it("rejects removing an operation it does not own", () => {
    expect(() => block(1).removeOp(testOp(1))).toThrow("is not owned");
  });

  it("clears operations and params", () => {
    const bb = block(1);
    const param = value(1);
    const op = testOp(1);
    const terminator = testTerminatorOp(2, [blockTarget(block(2))]);

    bb.appendParam(param);
    bb.appendOp(op);
    bb.setTerminator(terminator);

    bb.clear();

    expect(bb.params).toEqual([]);
    expect(bb.operations).toEqual([]);
    expect(op.ownerBlock).toBeNull();
    expect(terminator.ownerBlock).toBeNull();
  });

  it("computes predecessors from terminator uses", () => {
    const predecessor = block(1);
    const target = block(2);
    const terminator = testTerminatorOp(1, [blockTarget(target)]);

    predecessor.setTerminator(terminator);

    expect(target.predecessors()).toEqual(new Set([predecessor]));
  });
});
