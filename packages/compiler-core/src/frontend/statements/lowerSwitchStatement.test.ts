import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { SwitchTerminatorOp } from "../../ir/ops/control/SwitchTerminatorOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerSwitchStatement", () => {
  it("lowers switch cases with break and fallthrough targets", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule(
        "test.js",
        "switch (x) { case 1: foo(); break; case 2: bar(); default: baz(); } qux();",
      ),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const op = fn.entryBlock.terminator as SwitchTerminatorOp;

    expect(op).toBeInstanceOf(SwitchTerminatorOp);
    expect(op.cases).toHaveLength(3);
    expect(op.cases[0].test).not.toBeNull();
    expect(op.cases[1].test).not.toBeNull();
    expect(op.cases[2].test).toBeNull();

    const firstJump = op.cases[0].target.block.terminator as JumpTerminatorOp;
    const secondJump = op.cases[1].target.block.terminator as JumpTerminatorOp;
    const defaultJump = op.cases[2].target.block.terminator as JumpTerminatorOp;

    expect(firstJump.targetBlock).toBe(op.exitBlock);
    expect(secondJump.targetBlock).toBe(op.cases[2].target.block);
    expect(defaultJump.targetBlock).toBe(op.exitBlock);
  });
});
