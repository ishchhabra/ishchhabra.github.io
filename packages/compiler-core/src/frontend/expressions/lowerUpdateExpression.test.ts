import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { StoreBindingOp } from "../../ir/ops/bindings/StoreBindingOp";
import { CreateClassOp } from "../../ir/ops/classes/CreateClassOp";
import { BinaryOp } from "../../ir/ops/operators/BinaryOp";
import { StorePrivatePropertyOp } from "../../ir/ops/properties/StorePrivatePropertyOp";
import { StorePropertyOp } from "../../ir/ops/properties/StorePropertyOp";
import { StoreSuperPropertyOp } from "../../ir/ops/properties/StoreSuperPropertyOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerUpdateExpression", () => {
  it("lowers postfix identifier update", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x = 1; x++;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "InitializeBindingOp",
      "LoadBindingOp",
      "ConstantOp",
      "BinaryOp",
      "StoreBindingOp",
    ]);

    const binary = operations[4] as BinaryOp;
    const store = operations[5] as StoreBindingOp;

    expect(binary.operator).toBe("+");
    expect(store.value).toBe(binary.result);
  });

  it("returns the old value for postfix update", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x = 1; let y = x++;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "InitializeBindingOp",
      "LoadBindingOp",
      "ConstantOp",
      "BinaryOp",
      "StoreBindingOp",
      "InitializeBindingOp",
    ]);

    expect(operations[6].operands()).toEqual([operations[2].result]);
  });

  it("returns the new value for prefix update", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x = 1; let y = ++x;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations[6].operands()).toEqual([operations[4].result]);
  });

  it("lowers member update without re-evaluating the reference", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj.x++;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "LoadPropertyOp",
      "ConstantOp",
      "BinaryOp",
      "StorePropertyOp",
    ]);

    expect(operations[4]).toBeInstanceOf(StorePropertyOp);
  });

  it("lowers super property update", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "class C extends Base { method() { super.x++; } }"),
    );
    const classOp = moduleIR.entryFunction!.entryBlock.operations[1];
    const methodIR =
      classOp.constructor.name === "CreateClassOp" ? classOp.elements[0].functionIR : undefined;
    const operations = methodIR?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "SuperPropertyOp",
      "ConstantOp",
      "BinaryOp",
      "StoreSuperPropertyOp",
    ]);

    expect(operations[3]).toBeInstanceOf(StoreSuperPropertyOp);
  });

  it("lowers private property update", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "class C { #x; method() { this.#x++; } }"),
    );
    const classOp = moduleIR.entryFunction!.entryBlock.operations[0] as CreateClassOp;
    const operations = classOp.elements[1].functionIR.entryBlock.operations;

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadThisOp",
      "LoadPrivatePropertyOp",
      "ConstantOp",
      "BinaryOp",
      "StorePrivatePropertyOp",
    ]);

    expect(operations[4]).toBeInstanceOf(StorePrivatePropertyOp);
  });
});
