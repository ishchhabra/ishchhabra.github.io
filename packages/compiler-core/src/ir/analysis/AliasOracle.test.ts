import { describe, expect, it } from "vitest";

import { makeValueId } from "../core/Value";
import {
  arrayIndexPropertyMemoryLocation,
  compilerSlotMemoryLocation,
  globalMemoryLocation,
  heapShapeMemoryLocation,
  nonArrayStringPropertyMemoryLocation,
  stringPropertyMemoryLocation,
  UnknownMemoryLocation,
  unknownStringPropertyMemoryLocation,
  unknownPropertyMemoryLocation,
} from "../effects";
import { AliasOracle } from "./AliasOracle";

describe("AliasOracle", () => {
  it("keeps compiler slots outside unknown JavaScript memory", () => {
    const oracle = new AliasOracle();
    const slot = compilerSlotMemoryLocation(makeValueId(1));

    expect(oracle.alias(UnknownMemoryLocation, slot)).toBe("no-alias");
    expect(oracle.alias(slot, UnknownMemoryLocation)).toBe("no-alias");
  });

  it("aliases compiler slots only by slot identity", () => {
    const oracle = new AliasOracle();

    expect(
      oracle.alias(
        compilerSlotMemoryLocation(makeValueId(1)),
        compilerSlotMemoryLocation(makeValueId(1)),
      ),
    ).toBe("must-alias");
    expect(
      oracle.alias(
        compilerSlotMemoryLocation(makeValueId(1)),
        compilerSlotMemoryLocation(makeValueId(2)),
      ),
    ).toBe("no-alias");
  });

  it("uses object and key identity for heap properties", () => {
    const oracle = new AliasOracle();

    expect(
      oracle.alias(
        stringPropertyMemoryLocation(makeValueId(1), "x"),
        stringPropertyMemoryLocation(makeValueId(1), "x"),
      ),
    ).toBe("must-alias");
    expect(
      oracle.alias(
        stringPropertyMemoryLocation(makeValueId(1), "x"),
        stringPropertyMemoryLocation(makeValueId(1), "y"),
      ),
    ).toBe("no-alias");
    expect(
      oracle.alias(
        stringPropertyMemoryLocation(makeValueId(1), "x"),
        unknownPropertyMemoryLocation(makeValueId(1)),
      ),
    ).toBe("may-alias");
  });

  it("models array indices as string property keys", () => {
    const oracle = new AliasOracle();

    expect(
      oracle.alias(
        stringPropertyMemoryLocation(makeValueId(1), "0"),
        stringPropertyMemoryLocation(makeValueId(1), "0"),
      ),
    ).toBe("must-alias");
    expect(
      oracle.alias(
        stringPropertyMemoryLocation(makeValueId(1), "0"),
        arrayIndexPropertyMemoryLocation(makeValueId(1)),
      ),
    ).toBe("may-alias");
    expect(
      oracle.alias(
        stringPropertyMemoryLocation(makeValueId(1), "x"),
        arrayIndexPropertyMemoryLocation(makeValueId(1)),
      ),
    ).toBe("no-alias");
    expect(
      oracle.alias(
        stringPropertyMemoryLocation(makeValueId(1), "4294967294"),
        arrayIndexPropertyMemoryLocation(makeValueId(1)),
      ),
    ).toBe("may-alias");
    expect(
      oracle.alias(
        stringPropertyMemoryLocation(makeValueId(1), "4294967295"),
        arrayIndexPropertyMemoryLocation(makeValueId(1)),
      ),
    ).toBe("no-alias");
    expect(
      oracle.alias(
        stringPropertyMemoryLocation(makeValueId(1), "-0"),
        arrayIndexPropertyMemoryLocation(makeValueId(1)),
      ),
    ).toBe("no-alias");
    expect(
      oracle.alias(
        stringPropertyMemoryLocation(makeValueId(1), "00"),
        arrayIndexPropertyMemoryLocation(makeValueId(1)),
      ),
    ).toBe("no-alias");
  });

  it("keeps property-key summaries conservative", () => {
    const oracle = new AliasOracle();

    expect(
      oracle.alias(
        arrayIndexPropertyMemoryLocation(makeValueId(1)),
        arrayIndexPropertyMemoryLocation(makeValueId(1)),
      ),
    ).toBe("may-alias");
    expect(
      oracle.alias(
        stringPropertyMemoryLocation(makeValueId(1), "length"),
        unknownStringPropertyMemoryLocation(makeValueId(1)),
      ),
    ).toBe("may-alias");
    expect(
      oracle.alias(
        nonArrayStringPropertyMemoryLocation(makeValueId(1)),
        arrayIndexPropertyMemoryLocation(makeValueId(1)),
      ),
    ).toBe("no-alias");
  });

  it("treats heap shape as a structural alias of matching heap properties", () => {
    const oracle = new AliasOracle();
    const property = stringPropertyMemoryLocation(makeValueId(1), "x");
    const shape = heapShapeMemoryLocation(property.base);

    expect(oracle.alias(property, shape)).toBe("may-alias");
    expect(oracle.alias(shape, property)).toBe("may-alias");
  });

  it("keeps unknown global properties as summary locations", () => {
    const oracle = new AliasOracle();

    expect(oracle.alias(globalMemoryLocation("x"), globalMemoryLocation("x"))).toBe("must-alias");
    expect(oracle.alias(globalMemoryLocation("x"), globalMemoryLocation("y"))).toBe("no-alias");
    expect(oracle.alias(globalMemoryLocation(), globalMemoryLocation("x"))).toBe("may-alias");
    expect(oracle.alias(globalMemoryLocation(), globalMemoryLocation())).toBe("may-alias");
  });
});
