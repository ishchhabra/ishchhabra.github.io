import { describe, expect, it } from "vitest";

import { makeModuleId } from "./ModuleId";
import { ProgramModule } from "./ProgramModule";

describe("ProgramModule", () => {
  it("stores resolved module metadata", () => {
    const module = new ProgramModule(makeModuleId(1), {
      resolvedId: "/src/input.js",
      kind: "esm",
    });

    expect(module.resolvedId).toBe("/src/input.js");
    expect(module.kind).toBe("esm");
  });
});
