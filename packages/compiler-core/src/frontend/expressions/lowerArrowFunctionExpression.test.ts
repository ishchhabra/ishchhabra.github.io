import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { ReturnTerminatorOp } from "../../ir/ops/control/ReturnTerminatorOp";
import { CreateFunctionOp } from "../../ir/ops/functions/CreateFunctionOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerArrowFunctionExpression", () => {
  it("lowers a block-bodied arrow function", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const f = () => {};"),
    );
    const create = moduleIR.entryFunction?.entryBlock.operations[0] as CreateFunctionOp;

    expect(create.functionIR.kind).toBe("arrow");
    expect(create.functionIR.isAsync).toBe(false);
    expect(create.functionIR.isGenerator).toBe(false);
  });

  it("preserves async arrow function metadata", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const f = async () => {};"),
    );
    const create = moduleIR.entryFunction?.entryBlock.operations[0] as CreateFunctionOp;

    expect(create.functionIR.kind).toBe("arrow");
    expect(create.functionIR.isAsync).toBe(true);
  });

  it("lowers expression-bodied arrows as returns", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const f = () => 1;"),
    );
    const create = moduleIR.entryFunction?.entryBlock.operations[0] as CreateFunctionOp;
    const operations = create.functionIR.entryBlock.operations;

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "ReturnTerminatorOp",
    ]);
    expect(operations[1]).toBeInstanceOf(ReturnTerminatorOp);
  });
});
