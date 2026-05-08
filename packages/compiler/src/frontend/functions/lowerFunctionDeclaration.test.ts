import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { InitializeBindingOp } from "../../ir/ops/bindings/InitializeBindingOp";
import { LoadBindingOp } from "../../ir/ops/bindings/LoadBindingOp";
import { CreateFunctionOp } from "../../ir/ops/functions/CreateFunctionOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerFunctionDeclaration", () => {
  it("instantiates function declarations before statement execution", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "function f() {}"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "CreateFunctionOp",
      "InitializeBindingOp",
    ]);
    expect(operations[0]).toBeInstanceOf(CreateFunctionOp);
    expect(operations[1]).toBeInstanceOf(InitializeBindingOp);
    expect(moduleIR.functions).toHaveLength(2);
  });

  it("resolves references before a function declaration statement", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "f; function f() {}"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "CreateFunctionOp",
      "InitializeBindingOp",
      "LoadBindingOp",
    ]);
    expect(operations[2]).toBeInstanceOf(LoadBindingOp);
  });

  it("records async and generator flags on the nested function", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "async function f() {} function* g() {}"),
    );
    const [, asyncFunction, generatorFunction] = moduleIR.functions;

    expect(asyncFunction?.isAsync).toBe(true);
    expect(asyncFunction?.isGenerator).toBe(false);
    expect(generatorFunction?.isAsync).toBe(false);
    expect(generatorFunction?.isGenerator).toBe(true);
  });

  it("records simple function parameters on the nested function boundary", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "function f(a) { a; }"),
    );
    const nestedFunction = moduleIR.functions[1];
    const operations = nestedFunction?.entryBlock.operations ?? [];

    expect(nestedFunction?.params).toHaveLength(1);
    expect(nestedFunction?.params[0]).toMatchObject({
      kind: "argument",
      target: { kind: "binding" },
    });
    expect(operations.map((op) => op.constructor.name)).toEqual(["LoadBindingOp"]);
  });
});
