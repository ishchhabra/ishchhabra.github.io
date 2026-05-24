import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { InitializeBindingOp } from "../../ir/ops/bindings/InitializeBindingOp";
import { StoreBindingOp } from "../../ir/ops/bindings/StoreBindingOp";
import { ConstantOp } from "../../ir/ops/constants/ConstantOp";
import { DestructureBindingOp } from "../../ir/ops/patterns/DestructureBindingOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerVariableDeclaration", () => {
  it("initializes let declarations without initializers to undefined", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "InitializeBindingOp",
    ]);

    const constant = operations[0] as ConstantOp;
    const init = operations[1] as InitializeBindingOp;

    expect(constant.value).toBeUndefined();
    expect(init.value).toBe(constant.result);
  });

  it("initializes let declarations with initializer values", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x = 1;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "InitializeBindingOp",
    ]);
  });

  it("stores var initializer values at runtime", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "var x = 1;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "InitializeBindingOp",
      "ConstantOp",
      "StoreBindingOp",
    ]);

    expect(operations[3]).toBeInstanceOf(StoreBindingOp);
  });

  it("does not emit for var declarations without initializers", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "var x;"),
    );

    expect(moduleIR.entryFunction?.entryBlock.operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "InitializeBindingOp",
    ]);
  });

  it("rejects const declarations without initializers", () => {
    expect(() =>
      new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(parseModule("test.js", "const x;")),
    ).toThrow("Missing initializer in const declaration");
  });

  it("lowers lexical destructuring declarations", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let { x } = obj;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "DestructureBindingOp",
    ]);

    const destructure = operations[1] as DestructureBindingOp;
    expect(destructure.mode).toBe("initialize");
    expect(destructure.results).toHaveLength(1);
  });

  it("lowers var destructuring declarations as runtime stores", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "var { x } = obj;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "InitializeBindingOp",
      "LoadGlobalOp",
      "DestructureBindingOp",
    ]);

    const destructure = operations[3] as DestructureBindingOp;
    expect(destructure.mode).toBe("store");
    expect(destructure.results).toHaveLength(1);
  });
});
