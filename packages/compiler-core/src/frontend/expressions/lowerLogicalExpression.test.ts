import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { IfTerminatorOp } from "../../ir/ops/control/IfTerminatorOp";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { BinaryOp } from "../../ir/ops/operators/BinaryOp";
import { ConstantOp } from "../../ir/ops/constants/ConstantOp";
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
    const branch = entry.terminator as IfTerminatorOp;

    expect(branch).toBeInstanceOf(IfTerminatorOp);
    expect(entry.operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "IfTerminatorOp",
    ]);
    expect(branch.condition).toBe(entry.operations[0].result);
    expect(branch.thenBlock.operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "JumpTerminatorOp",
    ]);
    expect(branch.elseBlock).toBe(branch.exitBlock);
    expect(branch.elseTarget.operands.forwarded).toEqual([entry.operations[0].result]);

    const trueJump = branch.thenBlock.terminator as JumpTerminatorOp;

    expect(trueJump.targetBlock.params).toHaveLength(1);
    expect(trueJump.targetBlock).toBe(branch.exitBlock);
    expect(trueJump.args).toEqual([branch.thenBlock.operations[0].result]);
  });

  it("lowers || to short-circuit control flow", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "a || b;"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const entry = fn.entryBlock;
    const branch = entry.terminator as IfTerminatorOp;

    expect(branch).toBeInstanceOf(IfTerminatorOp);
    expect(branch.thenBlock).toBe(branch.exitBlock);
    expect(branch.thenTarget.operands.forwarded).toEqual([entry.operations[0].result]);
    expect(branch.elseBlock.operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "JumpTerminatorOp",
    ]);

    const falseJump = branch.elseBlock.terminator as JumpTerminatorOp;

    expect(falseJump.targetBlock.params).toHaveLength(1);
    expect(falseJump.targetBlock).toBe(branch.exitBlock);
    expect(falseJump.args).toEqual([branch.elseBlock.operations[0].result]);
  });

  it("lowers ?? with a loose nullish test", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "a ?? b;"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const entry = fn.entryBlock;
    const nullValue = entry.operations[1] as ConstantOp;
    const test = entry.operations[2] as BinaryOp;
    const branch = entry.terminator as IfTerminatorOp;

    expect(entry.operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "ConstantOp",
      "BinaryOp",
      "IfTerminatorOp",
    ]);
    expect(nullValue.value).toBe(null);
    expect(test.operator).toBe("!=");
    expect(test.left).toBe(entry.operations[0].result);
    expect(test.right).toBe(nullValue.result);
    expect(branch.condition).toBe(test.result);
    expect(branch.thenBlock).toBe(branch.exitBlock);
    expect(branch.thenTarget.operands.forwarded).toEqual([entry.operations[0].result]);
    expect(branch.elseBlock.operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "JumpTerminatorOp",
    ]);

    const falseJump = branch.elseBlock.terminator as JumpTerminatorOp;

    expect(falseJump.targetBlock.params).toHaveLength(1);
    expect(falseJump.targetBlock).toBe(branch.exitBlock);
    expect(falseJump.args).toEqual([branch.elseBlock.operations[0].result]);
  });

  it("uses the join block parameter as the expression result", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x = a && b;"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const branch = fn.entryBlock.terminator as IfTerminatorOp;
    const joinBlock = branch.exitBlock;

    expect(joinBlock.params).toHaveLength(1);
    expect(joinBlock.operations.map((op) => op.constructor.name)).toEqual(["InitializeBindingOp"]);
    expect(joinBlock.operations[0].operands()).toEqual([joinBlock.params[0]]);
  });
});
