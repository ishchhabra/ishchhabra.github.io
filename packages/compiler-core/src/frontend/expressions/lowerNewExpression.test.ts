import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { ConstructOp } from "../../ir/ops/calls/ConstructOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerNewExpression", () => {
  it("lowers new expressions", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const value = new Constructor(arg);"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "LoadGlobalOp",
      "ConstructOp",
      "InitializeBindingOp",
    ]);
    expect(operations[2]).toBeInstanceOf(ConstructOp);
  });

  it("lowers spread construct arguments", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "new Constructor(arg, ...rest);"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];
    const construct = operations[3] as ConstructOp;

    expect(construct.args).toEqual([
      { kind: "value", value: operations[1].result },
      { kind: "spread", value: operations[2].result },
    ]);
  });
});
