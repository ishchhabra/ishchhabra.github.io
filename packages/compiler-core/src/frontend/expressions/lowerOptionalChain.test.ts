import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { IfTerminatorOp } from "../../ir/ops/control/IfTerminatorOp";
import { CallOp } from "../../ir/ops/calls/CallOp";
import { LoadPropertyOp } from "../../ir/ops/properties/LoadPropertyOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerOptionalChain", () => {
  it("short-circuits optional member access to undefined", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj?.x;"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const branch = fn.entryBlock.terminator as IfTerminatorOp;
    const continuation = branch.elseBlock;

    expect(branch).toBeInstanceOf(IfTerminatorOp);
    expect(branch.thenBlock).toBe(branch.exitBlock);
    expect(branch.thenTarget.operands.forwarded).toEqual([fn.entryBlock.operations[0].result]);
    expect(continuation.operations[0]).toBeInstanceOf(LoadPropertyOp);
  });

  it("short-circuits optional calls before evaluating arguments", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "fn?.(arg);"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const branch = fn.entryBlock.terminator as IfTerminatorOp;
    const continuation = branch.elseBlock;

    expect(continuation.operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "CallOp",
      "JumpTerminatorOp",
    ]);
    expect(continuation.operations[1]).toBeInstanceOf(CallOp);
  });

  it("preserves receiver semantics for optional member calls", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj.method?.();"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const branch = fn.entryBlock.terminator as IfTerminatorOp;
    const continuation = branch.elseBlock;
    const call = continuation.operations[0] as CallOp;

    expect(call.target).toEqual({
      kind: "property",
      object: fn.entryBlock.operations[1].result,
      key: { kind: "static", name: "method" },
    });
  });

  it("short-circuits later links in a continuous optional chain", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj?.x?.y;"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const firstBranch = fn.entryBlock.terminator as IfTerminatorOp;
    const firstContinuation = firstBranch.elseBlock;
    const secondBranch = firstContinuation.terminator as IfTerminatorOp;

    expect(firstContinuation.operations[0]).toBeInstanceOf(LoadPropertyOp);
    expect(secondBranch).toBeInstanceOf(IfTerminatorOp);
  });
});
