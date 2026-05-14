import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { AwaitExpressionOp } from "../../ir/ops/async/AwaitExpressionOp";
import { ConstantOp } from "../../ir/ops/constants/ConstantOp";
import { ImportExpressionOp } from "../../ir/ops/modules/ImportExpressionOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerAwaitExpression", () => {
  it("lowers await expressions", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", 'async function load() { return await import("./mod.js"); }'),
    );
    const fn = moduleIR.functions.find((candidate) => candidate.isAsync)!;
    const operations = fn.entryBlock.operations;

    expect(operations[0]).toBeInstanceOf(ConstantOp);
    expect(operations[1]).toBeInstanceOf(ImportExpressionOp);
    expect(operations[2]).toBeInstanceOf(AwaitExpressionOp);
  });
});
