import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { BranchTerminatorOp } from "../../ir/ops/control/BranchTerminatorOp";
import { ForTerminatorOp } from "../../ir/ops/control/ForTerminatorOp";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerForStatement", () => {
  it("lowers for to structured loop CFG", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; for (x = 0; x < 3; x = x + 1) foo(); x = 4;"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const entryJump = fn.entryBlock.terminator as JumpTerminatorOp;
    const loop = entryJump.targetBlock.terminator as ForTerminatorOp;
    const testBranch = loop.testBlock.terminator as BranchTerminatorOp;
    const bodyJump = loop.bodyBlock.terminator as JumpTerminatorOp;
    const updateJump = loop.updateBlock.terminator as JumpTerminatorOp;

    expect(loop).toBeInstanceOf(ForTerminatorOp);
    expect(testBranch).toBeInstanceOf(BranchTerminatorOp);
    expect(testBranch.trueBlock).toBe(loop.bodyBlock);
    expect(testBranch.falseBlock).toBe(loop.exitBlock);
    expect(bodyJump.targetBlock).toBe(loop.updateBlock);
    expect(updateJump.targetBlock.terminator).toBe(loop);
    expect(loop.exitBlock.operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "StoreBindingOp",
    ]);
  });
});
