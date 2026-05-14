import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { ImportExpressionOp } from "../../ir/ops/modules/ImportExpressionOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerImportExpression", () => {
  it("lowers dynamic import expressions", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", 'const mod = import("./mod.js");'),
    );
    const operations = moduleIR.entryFunction!.entryBlock.operations;

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "ImportExpressionOp",
      "InitializeBindingOp",
    ]);
    expect(operations[1]).toBeInstanceOf(ImportExpressionOp);
  });

  it("lowers dynamic import options", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", 'const mod = import("./data.json", { with: { type: "json" } });'),
    );
    const operations = moduleIR.entryFunction!.entryBlock.operations;
    const importOp = operations[4] as ImportExpressionOp;

    expect(importOp.options).toBe(operations[3].result);
  });
});
