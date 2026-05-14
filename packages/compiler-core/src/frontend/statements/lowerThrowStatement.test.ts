import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { ThrowTerminatorOp } from "../../ir/ops/control/ThrowTerminatorOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerThrowStatement", () => {
  it("lowers throw statements to throw terminators", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "throw error;"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const op = fn.entryBlock.terminator as ThrowTerminatorOp;

    expect(op).toBeInstanceOf(ThrowTerminatorOp);
    expect(op.operands()).toHaveLength(1);
  });
});
