import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { BranchTerminatorOp } from "../../ir/ops/control/BranchTerminatorOp";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { WhileTerminatorOp } from "../../ir/ops/control/WhileTerminatorOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerWhileStatement", () => {
  it("lowers while to structured loop CFG", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; while (a) x = 1; x = 2;"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const entryJump = fn.entryBlock.terminator as JumpTerminatorOp;
    const loop = entryJump.targetBlock.terminator as WhileTerminatorOp;
    const testBranch = loop.testBlock.terminator as BranchTerminatorOp;
    const bodyJump = loop.bodyBlock.terminator as JumpTerminatorOp;

    expect(loop).toBeInstanceOf(WhileTerminatorOp);
    expect(testBranch).toBeInstanceOf(BranchTerminatorOp);
    expect(testBranch.trueBlock).toBe(loop.bodyBlock);
    expect(testBranch.falseBlock).toBe(loop.exitBlock);
    expect(loop.bodyBlock.operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "StoreBindingOp",
      "JumpTerminatorOp",
    ]);
    expect(bodyJump.targetBlock.terminator).toBe(loop);
    expect(loop.exitBlock.operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "StoreBindingOp",
    ]);
  });
});
