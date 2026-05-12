import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { ShortCircuitTerminatorOp } from "../../ir/ops/control/ShortCircuitTerminatorOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerLogicalExpression", () => {
  it("lowers && to short-circuit control flow", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "a && b;"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const entry = fn.entryBlock;
    const branch = entry.terminator as ShortCircuitTerminatorOp;

    expect(branch).toBeInstanceOf(ShortCircuitTerminatorOp);
    expect(entry.operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "ShortCircuitTerminatorOp",
    ]);
    expect(branch.operator).toBe("&&");
    expect(branch.test).toBe(entry.operations[0].result);
    expect(branch.bodyBlock.operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "JumpTerminatorOp",
    ]);
    expect(branch.exitTarget.operands.forwarded).toEqual([entry.operations[0].result]);

    const trueJump = branch.bodyBlock.terminator as JumpTerminatorOp;

    expect(trueJump.targetBlock.params).toHaveLength(1);
    expect(trueJump.targetBlock).toBe(branch.exitBlock);
    expect(trueJump.args).toEqual([branch.bodyBlock.operations[0].result]);
  });

  it("lowers || to short-circuit control flow", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "a || b;"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const entry = fn.entryBlock;
    const branch = entry.terminator as ShortCircuitTerminatorOp;

    expect(branch).toBeInstanceOf(ShortCircuitTerminatorOp);
    expect(branch.operator).toBe("||");
    expect(branch.test).toBe(entry.operations[0].result);
    expect(branch.exitTarget.operands.forwarded).toEqual([entry.operations[0].result]);
    expect(branch.bodyBlock.operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "JumpTerminatorOp",
    ]);

    const falseJump = branch.bodyBlock.terminator as JumpTerminatorOp;

    expect(falseJump.targetBlock.params).toHaveLength(1);
    expect(falseJump.targetBlock).toBe(branch.exitBlock);
    expect(falseJump.args).toEqual([branch.bodyBlock.operations[0].result]);
  });

  it("lowers ?? as semantic short-circuit control flow", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "a ?? b;"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const entry = fn.entryBlock;
    const branch = entry.terminator as ShortCircuitTerminatorOp;

    expect(entry.operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "ShortCircuitTerminatorOp",
    ]);
    expect(branch.operator).toBe("??");
    expect(branch.test).toBe(entry.operations[0].result);
    expect(branch.exitTarget.operands.forwarded).toEqual([entry.operations[0].result]);
    expect(branch.bodyBlock.operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "JumpTerminatorOp",
    ]);

    const falseJump = branch.bodyBlock.terminator as JumpTerminatorOp;

    expect(falseJump.targetBlock.params).toHaveLength(1);
    expect(falseJump.targetBlock).toBe(branch.exitBlock);
    expect(falseJump.args).toEqual([branch.bodyBlock.operations[0].result]);
  });

  it("uses the join block parameter as the expression result", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x = a && b;"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const branch = fn.entryBlock.terminator as ShortCircuitTerminatorOp;
    const joinBlock = branch.exitBlock;

    expect(joinBlock.params).toHaveLength(1);
    expect(joinBlock.operations.map((op) => op.constructor.name)).toEqual(["InitializeBindingOp"]);
    expect(joinBlock.operations[0].operands()).toEqual([joinBlock.params[0]]);
  });
});
