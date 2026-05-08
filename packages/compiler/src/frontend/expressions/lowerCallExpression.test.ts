import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { CallOp } from "../../ir/ops/calls/CallOp";
import { SuperCallOp } from "../../ir/ops/calls/SuperCallOp";
import { CreateClassOp } from "../../ir/ops/classes/CreateClassOp";
import { LoadGlobalOp } from "../../ir/ops/globals/LoadGlobalOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerCallExpression", () => {
  it("lowers a global call", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "foo();"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual(["LoadGlobalOp", "CallOp"]);

    const callee = operations[0] as LoadGlobalOp;
    const call = operations[1] as CallOp;

    expect(callee.name).toBe("foo");
    expect(call.target).toEqual({ kind: "value", callee: callee.result });
    expect(call.args).toEqual([]);
  });

  it("lowers call arguments in source order", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "foo(1, bar);"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "ConstantOp",
      "LoadGlobalOp",
      "CallOp",
    ]);
  });

  it("uses a binding load for declared callees", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let foo; foo();"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "InitializeBindingOp",
      "LoadBindingOp",
      "CallOp",
    ]);

    const call = operations[3] as CallOp;
    expect(call.target).toEqual({
      kind: "value",
      callee: operations[2].result,
    });
  });

  it("preserves receiver semantics for static member calls", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj.method();"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual(["LoadGlobalOp", "CallOp"]);

    const object = operations[0] as LoadGlobalOp;
    const call = operations[1] as CallOp;

    expect(call.target).toEqual({
      kind: "property",
      object: object.result,
      key: { kind: "static", name: "method" },
    });
  });

  it("preserves receiver semantics for computed member calls", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj[key]();"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "LoadGlobalOp",
      "CallOp",
    ]);

    const call = operations[2] as CallOp;
    expect(call.target).toEqual({
      kind: "property",
      object: operations[0].result,
      key: { kind: "computed", value: operations[1].result },
    });
  });

  it("rejects spread call arguments until spread lowering exists", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "foo(a, ...args);"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];
    const call = operations[3] as CallOp;

    expect(call.args).toEqual([
      { kind: "value", value: operations[1].result },
      { kind: "spread", value: operations[2].result },
    ]);
  });

  it("lowers super constructor calls", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "class C extends Base { constructor(value) { super(value); } }"),
    );
    const classOp = moduleIR.entryFunction?.entryBlock.operations[1] as CreateClassOp;
    const operations = classOp.elements[0].functionIR.entryBlock.operations;

    expect(operations.map((op) => op.constructor.name)).toEqual(["LoadBindingOp", "SuperCallOp"]);

    const call = operations[1] as SuperCallOp;
    expect(call.args).toHaveLength(1);
  });

  it("lowers super method calls with receiver-preserving call targets", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "class C extends Base { method() { return super.m(1); } }"),
    );
    const classOp = moduleIR.entryFunction?.entryBlock.operations[1] as CreateClassOp;
    const operations = classOp.elements[0].functionIR.entryBlock.operations;

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "CallOp",
      "ReturnTerminatorOp",
    ]);

    const call = operations[1] as CallOp;
    expect(call.target).toEqual({
      kind: "super-property",
      key: { kind: "static", name: "m" },
    });
  });

  it("lowers private method calls with receiver-preserving call targets", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "class C { #m() {} method() { return this.#m(); } }"),
    );
    const classOp = moduleIR.entryFunction?.entryBlock.operations[0] as CreateClassOp;
    const operations = classOp.elements[1].functionIR.entryBlock.operations;

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadThisOp",
      "CallOp",
      "ReturnTerminatorOp",
    ]);

    const call = operations[1] as CallOp;
    expect(call.target).toMatchObject({
      kind: "private-property",
      name: { name: "m" },
    });
  });
});
