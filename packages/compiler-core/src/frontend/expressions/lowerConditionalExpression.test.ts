import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { IfTerminatorOp } from "../../ir/ops/control/IfTerminatorOp";
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
    expect(entry.terminator).toBeInstanceOf(IfTerminatorOp);

    const branch = entry.terminator as IfTerminatorOp;
    const join = branch.exitBlock;

    expect(branch.thenBlock.operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "JumpTerminatorOp",
    ]);
    expect(branch.elseBlock.operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "JumpTerminatorOp",
    ]);

    expect(join?.params).toHaveLength(1);
    expect(join?.operations.map((op) => op.constructor.name)).toEqual(["InitializeBindingOp"]);
  });
});
