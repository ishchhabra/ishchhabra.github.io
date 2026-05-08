import { describe, expect, it } from "vitest";
import { blockTarget, forwardedOperands, producedOperands, successorValues } from "./TerminatorOp";
import { block, testTerminatorOp, value } from "./testing";

describe("TerminatorOp", () => {
  it("registers successor block uses on attach", () => {
    const owner = block(1);
    const target = block(2);
    const terminator = testTerminatorOp(1, [blockTarget(target)]);

    terminator.attach(owner);

    expect(target.uses.has(terminator)).toBe(true);
  });

  it("unregisters successor block uses on detach", () => {
    const owner = block(1);
    const target = block(2);
    const terminator = testTerminatorOp(1, [blockTarget(target)]);

    terminator.attach(owner);
    terminator.detach();

    expect(target.uses.has(terminator)).toBe(false);
  });

  it("returns targets in stable edge order", () => {
    const first = blockTarget(block(1));
    const second = blockTarget(block(2));
    const terminator = testTerminatorOp(1, [first, second]);

    expect(terminator.targets()).toEqual([first, second]);
  });

  it("replaces one target without mutating the original terminator", () => {
    const first = blockTarget(block(1));
    const second = blockTarget(block(2));
    const replacement = blockTarget(block(3));
    const terminator = testTerminatorOp(1, [first, second]);

    const updated = terminator.withTarget(1, replacement);

    expect(terminator.targets()).toEqual([first, second]);
    expect(updated.targets()).toEqual([first, replacement]);
  });

  it("rejects invalid target indices", () => {
    const terminator = testTerminatorOp(1, [blockTarget(block(1))]);

    expect(() => terminator.target(1)).toThrow("Invalid target index");
    expect(() => terminator.withTarget(1, blockTarget(block(2)))).toThrow("Invalid target index");
  });

  it("combines produced values before forwarded values", () => {
    const produced = value(1);
    const forwarded = value(2);
    const target = {
      block: block(1),
      operands: {
        produced: producedOperands([produced]).produced,
        forwarded: forwardedOperands([forwarded]).forwarded,
      },
    };

    expect(successorValues(target)).toEqual([produced, forwarded]);
  });
});
