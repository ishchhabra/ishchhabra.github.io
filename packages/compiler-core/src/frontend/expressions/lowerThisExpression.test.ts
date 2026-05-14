import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { LoadThisOp } from "../../ir/ops/functions/LoadThisOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerThisExpression", () => {
  it("lowers this to a dedicated load-this operation", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "this.value;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual(["LoadThisOp", "LoadPropertyOp"]);
    expect(operations[0]).toBeInstanceOf(LoadThisOp);
  });
});
