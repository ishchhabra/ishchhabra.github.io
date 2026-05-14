import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { CallOp } from "../../ir/ops/calls/CallOp";
import { NullishGuardTerminatorOp } from "../../ir/ops/control/NullishGuardTerminatorOp";
import { LoadPrivatePropertyOp } from "../../ir/ops/properties/LoadPrivatePropertyOp";
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

    const branch = fn.entryBlock.terminator as NullishGuardTerminatorOp;
    const continuation = branch.bodyBlock;

    expect(branch).toBeInstanceOf(NullishGuardTerminatorOp);
    expect(branch.exitTarget.block).toBe(branch.completionBlock);
    expect(branch.exitTarget.operands.forwarded).toEqual([fn.entryBlock.operations[0].result]);
    expect(continuation.operations[0]).toBeInstanceOf(LoadPropertyOp);
  });

  it("short-circuits optional calls before evaluating arguments", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "fn?.(arg);"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const branch = fn.entryBlock.terminator as NullishGuardTerminatorOp;
    const continuation = branch.bodyBlock;

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

    const operations = fn.blocks.flatMap((block) => block.operations);
    const load = operations.find((op) => op instanceof LoadPropertyOp);
    const call = operations.find((op) => op instanceof CallOp);
    if (!(load instanceof LoadPropertyOp)) throw new Error("Expected property load");
    if (!(call instanceof CallOp)) throw new Error("Expected call");

    expect(call.target).toEqual({
      kind: "value-with-receiver",
      callee: load.result,
      receiver: fn.entryBlock.operations[1].result,
    });
  });

  it("short-circuits later links in a continuous optional chain", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj?.x?.y;"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const firstBranch = fn.entryBlock.terminator as NullishGuardTerminatorOp;
    const firstContinuation = firstBranch.bodyBlock;
    const secondBranch = firstContinuation.terminator as NullishGuardTerminatorOp;

    expect(firstContinuation.operations[0]).toBeInstanceOf(LoadPropertyOp);
    expect(secondBranch).toBeInstanceOf(NullishGuardTerminatorOp);
  });

  it("lowers optional private member access", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "class C { #x = 1; m() { return this?.#x; } }"),
    );
    const method = moduleIR.functions.find((fn) => fn.kind === "class-method");
    if (method === undefined) throw new Error("Expected class method");

    const branch = method.entryBlock.terminator as NullishGuardTerminatorOp;
    const continuation = branch.bodyBlock;

    expect(branch).toBeInstanceOf(NullishGuardTerminatorOp);
    expect(continuation.operations[0]).toBeInstanceOf(LoadPrivatePropertyOp);
  });

  it("short-circuits optional private member calls", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "class C { #m() { return this; } run() { return this.#m?.(); } }"),
    );
    const run = moduleIR.functions.filter((fn) => fn.kind === "class-method").at(-1);
    if (run === undefined) throw new Error("Expected class method");

    const operations = run.blocks.flatMap((block) => block.operations);
    const call = operations.find((op) => op instanceof CallOp);
    if (!(call instanceof CallOp)) throw new Error("Expected private call");

    expect(operations.some((op) => op instanceof LoadPrivatePropertyOp)).toBe(true);
    expect(run.blocks.some((block) => block.terminator instanceof NullishGuardTerminatorOp)).toBe(
      true,
    );
    expect(call.target.kind).toBe("value-with-receiver");
  });
});
