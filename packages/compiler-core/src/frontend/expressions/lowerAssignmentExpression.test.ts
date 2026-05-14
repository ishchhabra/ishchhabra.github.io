import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { StoreBindingOp } from "../../ir/ops/bindings/StoreBindingOp";
import { CreateClassOp } from "../../ir/ops/classes/CreateClassOp";
import { IfTerminatorOp } from "../../ir/ops/control/IfTerminatorOp";
import { BinaryOp } from "../../ir/ops/operators/BinaryOp";
import { DestructureAssignmentOp } from "../../ir/ops/patterns/DestructureAssignmentOp";
import { StorePrivatePropertyOp } from "../../ir/ops/properties/StorePrivatePropertyOp";
import { StorePropertyOp } from "../../ir/ops/properties/StorePropertyOp";
import { StoreSuperPropertyOp } from "../../ir/ops/properties/StoreSuperPropertyOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerAssignmentExpression", () => {
  it("lowers simple identifier assignment", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; x = 1;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "InitializeBindingOp",
      "ConstantOp",
      "StoreBindingOp",
    ]);

    const store = operations[3] as StoreBindingOp;
    expect(store).toBeInstanceOf(StoreBindingOp);
    expect(store.value).toBe(operations[2].result);
  });

  it("returns the assigned value for simple assignment", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; let y = x = 1;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    const store = operations[3] as StoreBindingOp;
    const initializeY = operations[4];

    expect(store).toBeInstanceOf(StoreBindingOp);
    expect(initializeY.constructor.name).toBe("InitializeBindingOp");
    expect(initializeY.operands()).toEqual([store.value]);
  });

  it("lowers compound identifier assignment", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x = 1; x += 2;"),
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

  it("lowers static property assignment", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj.x = 1;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "ConstantOp",
      "StorePropertyOp",
    ]);

    const store = operations[2] as StorePropertyOp;
    expect(store).toBeInstanceOf(StorePropertyOp);
    expect(store.key).toEqual({ kind: "static", name: "x" });
    expect(store.value).toBe(operations[1].result);
  });

  it("lowers computed property assignment", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj[key] = 1;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "LoadGlobalOp",
      "ConstantOp",
      "StorePropertyOp",
    ]);

    const store = operations[3] as StorePropertyOp;
    expect(store.key).toEqual({
      kind: "computed",
      value: operations[1].result,
    });
  });

  it("lowers compound property assignment", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj.x += 1;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "LoadPropertyOp",
      "ConstantOp",
      "BinaryOp",
      "StorePropertyOp",
    ]);

    const binary = operations[3] as BinaryOp;
    const store = operations[4] as StorePropertyOp;

    expect(binary.operator).toBe("+");
    expect(store.value).toBe(binary.result);
  });

  it("lowers destructuring assignment", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; ({ x } = obj);"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "InitializeBindingOp",
      "LoadGlobalOp",
      "DestructureAssignmentOp",
    ]);

    expect(operations[3]).toBeInstanceOf(DestructureAssignmentOp);
  });

  it("lowers identifier logical assignment as short-circuiting control flow", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; x ||= compute();"),
    );
    const entry = moduleIR.entryFunction!.entryBlock;

    expect(entry.terminator).toBeInstanceOf(IfTerminatorOp);
  });

  it("lowers member logical assignment without evaluating the member reference twice", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj[key] &&= compute();"),
    );
    const operations = moduleIR.entryFunction!.blocks.flatMap((block) => block.operations);

    expect(operations.filter((op) => op.constructor.name === "LoadGlobalOp")).toHaveLength(3);
    expect(operations.some((op) => op.constructor.name === "StorePropertyOp")).toBe(true);
  });

  it("lowers super property assignment", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "class C extends Base { method() { super.x = 1; } }"),
    );
    const classOp = moduleIR.entryFunction!.entryBlock.operations[1];
    const methodIR =
      classOp.constructor.name === "CreateClassOp" ? classOp.elements[0].functionIR : undefined;
    const operations = methodIR?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "StoreSuperPropertyOp",
    ]);

    const store = operations[1] as StoreSuperPropertyOp;
    expect(store.key).toEqual({ kind: "static", name: "x" });
    expect(store.value).toBe(operations[0].result);
  });

  it("lowers compound super property assignment", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "class C extends Base { method() { super.x += 1; } }"),
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

    const store = operations[3] as StoreSuperPropertyOp;
    expect(store.value).toBe(operations[2].result);
  });

  it("lowers private property assignment", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "class C { #x; method() { this.#x = 1; } }"),
    );
    const classOp = moduleIR.entryFunction!.entryBlock.operations[0] as CreateClassOp;
    const operations = classOp.elements[1].functionIR.entryBlock.operations;

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadThisOp",
      "ConstantOp",
      "StorePrivatePropertyOp",
    ]);

    const store = operations[2] as StorePrivatePropertyOp;
    expect(store.name.name).toBe("x");
    expect(store.value).toBe(operations[1].result);
  });
});
