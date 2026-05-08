import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { YieldExpressionOp } from "../../ir/ops/generators/YieldExpressionOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerYieldExpression", () => {
  it("lowers yield expressions", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "function* g() { return yield value; }"),
    );
    const fn = moduleIR.functions.find((candidate) => candidate.isGenerator)!;
    const operations = fn.entryBlock.operations;

    expect(operations.map((op) => op.constructor.name)).toContain("YieldExpressionOp");
  });

  it("lowers delegated yield expressions", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "function* g() { return yield* values; }"),
    );
    const fn = moduleIR.functions.find((candidate) => candidate.isGenerator)!;
    const op = fn.entryBlock.operations.find(
      (candidate) => candidate.constructor.name === "YieldExpressionOp",
    ) as YieldExpressionOp;

    expect(op.delegate).toBe(true);
  });
});
