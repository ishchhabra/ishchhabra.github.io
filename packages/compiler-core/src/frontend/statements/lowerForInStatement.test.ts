import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { ForInTerminatorOp } from "../../ir/ops/control/ForInTerminatorOp";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerForInStatement", () => {
  it("lowers for-in to structured enumeration CFG", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "for (const key in obj) foo(key); bar();"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const entryJump = fn.entryBlock.terminator as JumpTerminatorOp;
    const loop = entryJump.targetBlock.terminator as ForInTerminatorOp;
    const bodyJump = loop.bodyBlock.terminator as JumpTerminatorOp;

    expect(entryJump).toBeInstanceOf(JumpTerminatorOp);
    expect(loop).toBeInstanceOf(ForInTerminatorOp);
    expect(loop.bodyBlock.params).toHaveLength(1);
    expect(loop.bodyTarget.operands.produced).toEqual(loop.bodyBlock.params);
    expect(loop.bodyTarget.operands.forwarded).toEqual([]);
    expect(bodyJump).toBeInstanceOf(JumpTerminatorOp);
    expect(bodyJump.targetBlock).toBe(entryJump.targetBlock);
    expect(loop.bodyBlock.operations.map((op) => op.constructor.name)).toEqual([
      "InitializeBindingOp",
      "LoadGlobalOp",
      "LoadBindingOp",
      "CallOp",
      "JumpTerminatorOp",
    ]);
    expect(loop.completionBlock.operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "CallOp",
    ]);
  });
});
