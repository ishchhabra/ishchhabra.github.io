import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { CreateClassOp } from "../../ir/ops/classes/CreateClassOp";
import { LoadGlobalOp } from "../../ir/ops/globals/LoadGlobalOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerClass", () => {
  it("lowers class declarations to class creation and binding initialization", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "class C extends Base { method() {} }"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "CreateClassOp",
      "InitializeBindingOp",
    ]);

    const superClass = operations[0] as LoadGlobalOp;
    const classOp = operations[1] as CreateClassOp;

    expect(superClass.name).toBe("Base");
    expect(classOp.name).toBe("C");
    expect(classOp.superClass).toBe(superClass.result);
    expect(classOp.elements).toHaveLength(1);
    expect(classOp.elements[0]).toMatchObject({
      kind: "method",
      methodKind: "method",
      placement: "prototype",
      key: { kind: "public", key: { kind: "static", name: "method" } },
    });
  });

  it("lowers constructors, static methods, and accessors", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule(
        "test.js",
        "const C = class { constructor() {} static create() {} get value() {} set value(next) {} };",
      ),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];
    const classOp = operations[0] as CreateClassOp;

    expect(classOp.elements.map((element) => element.methodKind)).toEqual([
      "constructor",
      "method",
      "get",
      "set",
    ]);
    expect(classOp.elements.map((element) => element.placement)).toEqual([
      "prototype",
      "static",
      "prototype",
      "prototype",
    ]);
  });

  it("lowers public fields as deferred class elements", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "class C { x = 1; y; static count = 0; }"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];
    const classOp = operations[0] as CreateClassOp;

    expect(classOp.elements.map((element) => element.kind)).toEqual(["field", "field", "field"]);
    expect(classOp.elements).toMatchObject([
      {
        placement: "instance",
        key: { kind: "public", key: { kind: "static", name: "x" } },
      },
      {
        placement: "instance",
        key: { kind: "public", key: { kind: "static", name: "y" } },
        initializer: null,
      },
      {
        placement: "static",
        key: { kind: "public", key: { kind: "static", name: "count" } },
      },
    ]);
  });

  it("lowers private fields and methods with private-name identities", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "class C { #x = 1; #m() { return this.#x; } }"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];
    const classOp = operations[0] as CreateClassOp;

    expect(classOp.elements).toMatchObject([
      {
        kind: "field",
        key: { kind: "private", name: { name: "x" } },
      },
      {
        kind: "method",
        key: { kind: "private", name: { name: "m" } },
      },
    ]);
  });
});
