import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { StoreBindingOp } from "../../ir/ops/bindings/StoreBindingOp";
import { IfTerminatorOp } from "../../ir/ops/control/IfTerminatorOp";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { ReturnTerminatorOp } from "../../ir/ops/control/ReturnTerminatorOp";
import { CreateFunctionOp } from "../../ir/ops/functions/CreateFunctionOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerIfStatement", () => {
  it("lowers if without alternate", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; if (a) x = 1; x = 2;"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const branch = fn.entryBlock.terminator as IfTerminatorOp;

    expect(branch).toBeInstanceOf(IfTerminatorOp);
    expect(branch.thenBlock.operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "StoreBindingOp",
      "JumpTerminatorOp",
    ]);
    expect(branch.elseBlock.operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "StoreBindingOp",
    ]);

    const jump = branch.thenBlock.terminator as JumpTerminatorOp;

    expect(jump.targetBlock).toBe(branch.elseBlock);
    expect(branch.thenBlock.operations[1]).toBeInstanceOf(StoreBindingOp);
    expect(branch.elseBlock.operations[1]).toBeInstanceOf(StoreBindingOp);
  });

  it("lowers if with alternate", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; if (a) x = 1; else x = 2; x = 3;"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const branch = fn.entryBlock.terminator as IfTerminatorOp;
    const trueJump = branch.thenBlock.terminator as JumpTerminatorOp;
    const falseJump = branch.elseBlock.terminator as JumpTerminatorOp;

    expect(branch).toBeInstanceOf(IfTerminatorOp);
    expect(branch.thenBlock.operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "StoreBindingOp",
      "JumpTerminatorOp",
    ]);
    expect(branch.elseBlock.operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "StoreBindingOp",
      "JumpTerminatorOp",
    ]);
    expect(trueJump.targetBlock).toBe(falseJump.targetBlock);
    expect(trueJump.targetBlock.operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "StoreBindingOp",
    ]);
  });

  it("does not emit a jump after a terminating consequent", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const f = function () { if (a) return 1; return 2; };"),
    );
    const create = moduleIR.entryFunction?.entryBlock.operations[0] as CreateFunctionOp;
    const branch = create.functionIR.entryBlock.terminator as IfTerminatorOp;

    expect(branch.thenBlock.terminator).toBeInstanceOf(ReturnTerminatorOp);
    expect(branch.thenBlock.operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "ReturnTerminatorOp",
    ]);
    expect(branch.elseBlock.operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "ReturnTerminatorOp",
    ]);
  });
});
