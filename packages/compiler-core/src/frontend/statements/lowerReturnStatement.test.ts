import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { ReturnTerminatorOp } from "../../ir/ops/control/ReturnTerminatorOp";
import { CreateFunctionOp } from "../../ir/ops/functions/CreateFunctionOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerReturnStatement", () => {
  it("lowers a return value as a function terminator", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const f = function () { return 1; };"),
    );
    const create = moduleIR.entryFunction?.entryBlock.operations[0] as CreateFunctionOp;
    const operations = create.functionIR.entryBlock.operations;

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "ReturnTerminatorOp",
    ]);

    const terminator = operations[1] as ReturnTerminatorOp;
    expect(terminator.value).toBe(operations[0].result);
  });

  it("lowers a bare return", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const f = function () { return; };"),
    );
    const create = moduleIR.entryFunction?.entryBlock.operations[0] as CreateFunctionOp;
    const operations = create.functionIR.entryBlock.operations;

    expect(operations).toHaveLength(1);
    expect(operations[0]).toBeInstanceOf(ReturnTerminatorOp);
    expect((operations[0] as ReturnTerminatorOp).value).toBeNull();
  });
});
