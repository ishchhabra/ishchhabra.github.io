import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { CreateFunctionOp } from "../../ir/ops/functions/CreateFunctionOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerFunctionExpression", () => {
  it("lowers an anonymous function expression", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const f = function () {};"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "CreateFunctionOp",
      "InitializeBindingOp",
    ]);

    const create = operations[0] as CreateFunctionOp;
    expect(create.functionIR.kind).toBe("function");
    expect(create.functionIR.name).toBeNull();
    expect(create.functionIR.isAsync).toBe(false);
    expect(create.functionIR.isGenerator).toBe(false);
  });

  it("preserves named function expression metadata", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const f = function g() {};"),
    );
    const create = moduleIR.entryFunction?.entryBlock.operations[0] as CreateFunctionOp;

    expect(create.functionIR.name).toBe("g");
  });

  it("preserves async and generator flags", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const f = async function* () {};"),
    );
    const create = moduleIR.entryFunction?.entryBlock.operations[0] as CreateFunctionOp;

    expect(create.functionIR.isAsync).toBe(true);
    expect(create.functionIR.isGenerator).toBe(true);
  });

  it("records declaration captures for function expressions", () => {
    const { moduleIR, declarations } = new ModuleIRBuilder({
      ids: new IRIdAllocator(),
    }).build(
      parseModule("test.js", "function outer(x) { return function inner() { return x; }; }"),
    );
    const outer = moduleIR.functions[1];
    const create = outer?.entryBlock.operations.find(
      (op): op is CreateFunctionOp => op instanceof CreateFunctionOp,
    );

    if (create === undefined) {
      throw new Error("Expected nested function creation");
    }

    expect(create.captures.map((id) => declarations.get(id).name)).toEqual(["x"]);
    expect(create.functionIR.params).toContainEqual({
      kind: "capture",
      declarationId: create.captures[0],
    });
  });
});
