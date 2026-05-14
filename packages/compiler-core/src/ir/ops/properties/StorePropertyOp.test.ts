import { describe, expect, it } from "vitest";

import { makeOperationId } from "../../core/Operation";
import { value } from "../../core/testing";
import {
  stringPropertyMemoryLocation,
  UnknownMemoryLocation,
  unknownPropertyMemoryLocation,
} from "../../effects";
import { StorePropertyOp } from "./StorePropertyOp";

describe("StorePropertyOp", () => {
  it("models static property assignment as opaque JavaScript memory plus the exact key", () => {
    const object = value(1);
    const assigned = value(2);
    const op = new StorePropertyOp(
      makeOperationId(1),
      object,
      { kind: "static", name: "x" },
      assigned,
    );

    expect(op.effects()).toEqual({
      memory: {
        reads: [UnknownMemoryLocation],
        writes: [UnknownMemoryLocation, stringPropertyMemoryLocation(object.id, "x")],
      },
      mayThrow: true,
      mayDiverge: true,
      isObservable: true,
    });
  });

  it("models computed property assignment as opaque JavaScript memory plus an unknown key", () => {
    const object = value(1);
    const key = value(2);
    const assigned = value(3);
    const op = new StorePropertyOp(
      makeOperationId(1),
      object,
      { kind: "computed", value: key },
      assigned,
    );

    expect(op.effects()).toEqual({
      memory: {
        reads: [UnknownMemoryLocation],
        writes: [UnknownMemoryLocation, unknownPropertyMemoryLocation(object.id)],
      },
      mayThrow: true,
      mayDiverge: true,
      isObservable: true,
    });
  });
});
