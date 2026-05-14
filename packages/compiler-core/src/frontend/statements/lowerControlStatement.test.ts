import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { LabeledTerminatorOp } from "../../ir/ops/control/LabeledTerminatorOp";
import { SwitchTerminatorOp } from "../../ir/ops/control/SwitchTerminatorOp";
import { WhileTerminatorOp } from "../../ir/ops/control/WhileTerminatorOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("control statements", () => {
  it("lowers break to the nearest loop exit", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "while (a) break;"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const entryJump = fn.entryBlock.terminator as JumpTerminatorOp;
    const loop = entryJump.targetBlock.terminator as WhileTerminatorOp;
    const jump = loop.bodyBlock.terminator as JumpTerminatorOp;

    expect(loop).toBeInstanceOf(WhileTerminatorOp);
    expect(jump).toBeInstanceOf(JumpTerminatorOp);
    expect(jump.targetBlock).toBe(loop.completionBlock);
  });

  it("lowers continue to the nearest loop continuation", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "while (a) continue;"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const entryJump = fn.entryBlock.terminator as JumpTerminatorOp;
    const loop = entryJump.targetBlock.terminator as WhileTerminatorOp;
    const jump = loop.bodyBlock.terminator as JumpTerminatorOp;

    expect(loop).toBeInstanceOf(WhileTerminatorOp);
    expect(jump).toBeInstanceOf(JumpTerminatorOp);
    expect(jump.targetBlock.terminator).toBe(loop);
  });

  it("lowers labeled continue to the labeled loop continuation", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "outer: while (a) while (b) continue outer;"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const entryJump = fn.entryBlock.terminator as JumpTerminatorOp;
    const outer = entryJump.targetBlock.terminator as WhileTerminatorOp;
    const innerJump = outer.bodyBlock.terminator as JumpTerminatorOp;
    const inner = innerJump.targetBlock.terminator as WhileTerminatorOp;
    const jump = inner.bodyBlock.terminator as JumpTerminatorOp;

    expect(outer.label).toBe("outer");
    expect(inner.label).toBeNull();
    expect(jump.targetBlock.terminator).toBe(outer);
  });

  it("lowers non-loop labels as structured labeled regions", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "outer: switch (x) { case 1: break outer; }"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const labeled = fn.entryBlock.terminator as LabeledTerminatorOp;
    const switchOp = labeled.bodyBlock.terminator as SwitchTerminatorOp;
    const caseJump = switchOp.cases[0].target.block.terminator as JumpTerminatorOp;

    expect(labeled).toBeInstanceOf(LabeledTerminatorOp);
    expect(labeled.label).toBe("outer");
    expect(switchOp).toBeInstanceOf(SwitchTerminatorOp);
    expect(switchOp.label).toBeNull();
    expect(caseJump.targetBlock).toBe(labeled.completionBlock);
  });
});
