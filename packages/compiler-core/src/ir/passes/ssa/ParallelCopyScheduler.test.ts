import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../core/IRIdAllocator";
import { Value } from "../../core/Value";
import { scheduleParallelCopies } from "./ParallelCopyScheduler";

describe("scheduleParallelCopies", () => {
  it("drops self-copies", () => {
    const ids = new IRIdAllocator();
    const value = new Value(ids.valueId());

    expect(scheduleParallelCopies([{ target: value, source: value }], { ids })).toEqual([]);
  });

  it("schedules acyclic copies without temporaries", () => {
    const ids = new IRIdAllocator();
    const a = new Value(ids.valueId());
    const b = new Value(ids.valueId());
    const c = new Value(ids.valueId());
    const d = new Value(ids.valueId());

    const scheduled = scheduleParallelCopies(
      [
        { target: a, source: b },
        { target: b, source: c },
        { target: c, source: d },
      ],
      { ids },
    );

    expect(scheduled.map((copy) => [copy.target, copy.source])).toEqual([
      [a, b],
      [b, c],
      [c, d],
    ]);
  });

  it("breaks swaps with a temporary", () => {
    const ids = new IRIdAllocator();
    const a = new Value(ids.valueId());
    const b = new Value(ids.valueId());

    const scheduled = scheduleParallelCopies(
      [
        { target: a, source: b },
        { target: b, source: a },
      ],
      { ids },
    );

    const temporary = scheduled[0].target;

    expect(scheduled.map((copy) => [copy.target, copy.source])).toEqual([
      [temporary, a],
      [a, b],
      [b, temporary],
    ]);
  });

  it("breaks longer cycles with a temporary", () => {
    const ids = new IRIdAllocator();
    const a = new Value(ids.valueId());
    const b = new Value(ids.valueId());
    const c = new Value(ids.valueId());

    const scheduled = scheduleParallelCopies(
      [
        { target: a, source: b },
        { target: b, source: c },
        { target: c, source: a },
      ],
      { ids },
    );

    const temporary = scheduled[0].target;

    expect(scheduled.map((copy) => [copy.target, copy.source])).toEqual([
      [temporary, a],
      [a, b],
      [b, c],
      [c, temporary],
    ]);
  });

  it("rejects duplicate targets", () => {
    const ids = new IRIdAllocator();
    const a = new Value(ids.valueId());
    const b = new Value(ids.valueId());
    const c = new Value(ids.valueId());

    expect(() =>
      scheduleParallelCopies(
        [
          { target: a, source: b },
          { target: a, source: c },
        ],
        { ids },
      ),
    ).toThrow("writes value");
  });
});
