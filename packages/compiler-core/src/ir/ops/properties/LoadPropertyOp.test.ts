import { describe, expect, it } from "vitest";
import { makeOperationId } from "../../core/Operation";
import { value } from "../../core/testing";
import {
  stringPropertyMemoryLocation,
  UnknownMemoryLocation,
  unknownPropertyMemoryLocation,
} from "../../effects";
import { LoadPropertyOp } from "./LoadPropertyOp";

describe("LoadPropertyOp", () => {
  it("models static property access as opaque JavaScript memory plus the exact key", () => {
    const object = value(1);
    const op = new LoadPropertyOp(
      makeOperationId(1),
      object,
      { kind: "static", name: "x" },
      value(2),
    );

    expect(op.effects()).toEqual({
      memory: {
        reads: [UnknownMemoryLocation, stringPropertyMemoryLocation(object.id, "x")],
        writes: [UnknownMemoryLocation],
      },
      mayThrow: true,
      mayDiverge: true,
      isObservable: true,
    });
  });

  it("models computed property access as opaque JavaScript memory plus an unknown key", () => {
    const object = value(1);
    const key = value(2);
    const op = new LoadPropertyOp(
      makeOperationId(1),
      object,
      { kind: "computed", value: key },
      value(3),
    );

    expect(op.effects()).toEqual({
      memory: {
        reads: [UnknownMemoryLocation, unknownPropertyMemoryLocation(object.id)],
        writes: [UnknownMemoryLocation],
      },
      mayThrow: true,
      mayDiverge: true,
      isObservable: true,
    });
  });
});
