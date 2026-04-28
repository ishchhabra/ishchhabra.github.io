import { describe, expect, it } from "vitest";
import { Environment } from "../../environment";
import { ProjectEnvironment } from "../../ProjectEnvironment";
import { StoreLocalOp } from "../ops/mem/StoreLocal";
import { AliasOracle } from "./AliasOracle";
import {
  computedPropertyLocation,
  localLocation,
  staticPropertyLocation,
  UnknownLocation,
} from "./MemoryLocation";

describe("AliasOracle", () => {
  it("disambiguates local and property locations conservatively", () => {
    const env = new Environment(new ProjectEnvironment());
    const oracle = new AliasOracle(env);
    const first = env.createValue();
    const second = env.createValue();
    const object = env.createValue();

    expect(
      oracle.alias(localLocation(first.declarationId), localLocation(first.declarationId)),
    ).toBe("must-alias");
    expect(
      oracle.alias(localLocation(first.declarationId), localLocation(second.declarationId)),
    ).toBe("no-alias");
    expect(
      oracle.alias(staticPropertyLocation(object, "x"), staticPropertyLocation(object, "x")),
    ).toBe("may-alias");
    expect(
      oracle.alias(staticPropertyLocation(object, "x"), computedPropertyLocation(object)),
    ).toBe("may-alias");
    expect(oracle.alias(UnknownLocation, localLocation(first.declarationId))).toBe("may-alias");
  });

  it("answers mod/ref queries from operation memory effects", () => {
    const env = new Environment(new ProjectEnvironment());
    const oracle = new AliasOracle(env);
    const target = env.createValue();
    const other = env.createValue();
    const value = env.createValue();
    const store = env.createOperation(StoreLocalOp, env.createValue(), target, value);

    expect(oracle.getModRefInfo(store, localLocation(target.declarationId))).toBe("mod");
    expect(oracle.getModRefInfo(store, localLocation(other.declarationId))).toBe("no-mod-ref");
  });
});
