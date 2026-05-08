import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { LoadBindingOp } from "../../ir/ops/bindings/LoadBindingOp";
import { LoadGlobalOp } from "../../ir/ops/globals/LoadGlobalOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerIdentifier", () => {
  it("lowers a declared identifier to a binding load", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; x;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "InitializeBindingOp",
      "LoadBindingOp",
    ]);

    const load = operations[2] as LoadBindingOp;
    expect(load).toBeInstanceOf(LoadBindingOp);
    expect(load.result.declarationId).toBeNull();
  });

  it("uses the declaration resolved by scope analysis", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; { let x; x; }"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "InitializeBindingOp",
      "ConstantOp",
      "InitializeBindingOp",
      "LoadBindingOp",
    ]);

    expect(operations[4]).toBeInstanceOf(LoadBindingOp);
  });

  it("lowers an unresolved identifier to a global load", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "foo;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual(["LoadGlobalOp"]);

    const load = operations[0] as LoadGlobalOp;
    expect(load).toBeInstanceOf(LoadGlobalOp);
    expect(load.name).toBe("foo");
  });
});
