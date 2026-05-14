import { describe, expect, it } from "vitest";

import { makeFunctionId } from "./FunctionIR";
import { functionIR, moduleIR } from "./testing";

describe("ModuleIR", () => {
  it("adds a function and records module ownership", () => {
    const mod = moduleIR(1);
    const fn = functionIR(1);

    mod.addFunction(fn);

    expect(fn.ownerModule).toBe(mod);
    expect(mod.functions).toEqual([fn]);
  });

  it("rejects adding a function owned by another module", () => {
    const first = moduleIR(1);
    const second = moduleIR(2);
    const fn = functionIR(1);

    first.addFunction(fn);

    expect(() => second.addFunction(fn)).toThrow("already belongs to another module");
  });

  it("rejects adding the same function twice", () => {
    const mod = moduleIR(1);
    const fn = functionIR(1);

    mod.addFunction(fn);

    expect(() => mod.addFunction(fn)).toThrow("already belongs to this module");
  });

  it("rejects adding a different function with the same id", () => {
    const mod = moduleIR(1);

    mod.addFunction(functionIR(1));

    expect(() => mod.addFunction(functionIR(1))).toThrow("already exists in Module");
  });

  it("looks up an owned function by id", () => {
    const mod = moduleIR(1);
    const fn = functionIR(1);

    mod.addFunction(fn);

    expect(mod.getFunction(fn.id)).toBe(fn);
  });

  it("throws when looking up a missing function", () => {
    expect(() => moduleIR(1).getFunction(makeFunctionId(404))).toThrow("does not belong to Module");
  });

  it("removes a non-entry function and clears module ownership", () => {
    const mod = moduleIR(1);
    const fn = functionIR(1);

    mod.addFunction(fn);
    mod.removeFunction(fn);

    expect(fn.ownerModule).toBeNull();
    expect(mod.functions).toEqual([]);
  });

  it("rejects removing the entry function", () => {
    const mod = moduleIR(1);
    const fn = functionIR(1);

    mod.addFunction(fn);
    mod.setEntryFunction(fn);

    expect(() => mod.removeFunction(fn)).toThrow("Cannot remove entry Function");
  });

  it("marks an owned function as the entry function", () => {
    const mod = moduleIR(1);
    const fn = functionIR(1);

    mod.addFunction(fn);
    mod.setEntryFunction(fn);

    expect(mod.entryFunction).toBe(fn);
  });

  it("rejects marking an unowned function as the entry function", () => {
    const mod = moduleIR(1);
    const fn = functionIR(1);

    expect(() => mod.setEntryFunction(fn)).toThrow("is not owned by Module");
  });
});
