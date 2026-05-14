import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { ConditionalTerminatorOp } from "../../ir/ops/control/ConditionalTerminatorOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerConditionalExpression", () => {
  it("lowers conditional expressions to branch CFG with a join value", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const value = condition ? consequent : alternate;"),
    );

    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const entry = fn.entryBlock;
    expect(entry.terminator).toBeInstanceOf(ConditionalTerminatorOp);

    const branch = entry.terminator as ConditionalTerminatorOp;
    const join = branch.completionBlock;

    expect(branch.consequentBlock.operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "JumpTerminatorOp",
    ]);
    expect(branch.alternateBlock.operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "JumpTerminatorOp",
    ]);

    expect(join?.params).toHaveLength(1);
    expect(join?.operations.map((op) => op.constructor.name)).toEqual(["InitializeBindingOp"]);
  });
});
