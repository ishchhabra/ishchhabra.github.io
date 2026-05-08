import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { CreateClassOp } from "../../ir/ops/classes/CreateClassOp";
import { LoadGlobalOp } from "../../ir/ops/globals/LoadGlobalOp";
import { LoadPrivatePropertyOp } from "../../ir/ops/properties/LoadPrivatePropertyOp";
import { LoadPropertyOp } from "../../ir/ops/properties/LoadPropertyOp";
import { SuperPropertyOp } from "../../ir/ops/properties/SuperPropertyOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerMemberExpression", () => {
  it("lowers static property access", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj.x;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual(["LoadGlobalOp", "LoadPropertyOp"]);

    const object = operations[0] as LoadGlobalOp;
    const load = operations[1] as LoadPropertyOp;

    expect(object.name).toBe("obj");
    expect(load.object).toBe(object.result);
    expect(load.key).toEqual({ kind: "static", name: "x" });
  });

  it("lowers computed literal property access", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", 'obj["x"];'),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "ConstantOp",
      "LoadPropertyOp",
    ]);

    const load = operations[2] as LoadPropertyOp;
    expect(load.key).toEqual({
      kind: "computed",
      value: operations[1].result,
    });
  });

  it("lowers computed identifier property access", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj[key];"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "LoadGlobalOp",
      "LoadPropertyOp",
    ]);

    const load = operations[2] as LoadPropertyOp;
    expect(load.key).toEqual({
      kind: "computed",
      value: operations[1].result,
    });
  });

  it("routes optional member access through chain lowering", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj?.x;"),
    );
    const entry = moduleIR.entryFunction?.entryBlock;

    expect(entry?.operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "LoadGlobalOp",
      "ConstantOp",
      "BinaryOp",
      "IfTerminatorOp",
    ]);
  });

  it("lowers super property reads without materializing super as a value", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "class C extends Base { method() { return super.x; } }"),
    );
    const classOp = moduleIR.entryFunction?.entryBlock.operations[1] as CreateClassOp;
    const operations = classOp.elements[0].functionIR.entryBlock.operations;

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "SuperPropertyOp",
      "ReturnTerminatorOp",
    ]);

    const load = operations[0] as SuperPropertyOp;
    expect(load.key).toEqual({ kind: "static", name: "x" });
  });

  it("lowers private property reads through private-name identity", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "class C { #x; method() { return this.#x; } }"),
    );
    const classOp = moduleIR.entryFunction?.entryBlock.operations[0] as CreateClassOp;
    const operations = classOp.elements[1].functionIR.entryBlock.operations;

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadThisOp",
      "LoadPrivatePropertyOp",
      "ReturnTerminatorOp",
    ]);

    const load = operations[1] as LoadPrivatePropertyOp;
    expect(load.name.name).toBe("x");
    expect(load.object).toBe(operations[0].result);
  });
});
