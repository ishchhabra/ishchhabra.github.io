import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { SequenceExpressionOp } from "../../ir/ops/operators/SequenceExpressionOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerSequenceExpression", () => {
  it("lowers sequence expressions in source order", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const value = (first(), second(), third());"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "CallOp",
      "LoadGlobalOp",
      "CallOp",
      "LoadGlobalOp",
      "CallOp",
      "SequenceExpressionOp",
      "InitializeBindingOp",
    ]);

    const sequence = operations[6] as SequenceExpressionOp;
    expect(sequence.expressions).toEqual([
      operations[1].result,
      operations[3].result,
      operations[5].result,
    ]);
  });
});
