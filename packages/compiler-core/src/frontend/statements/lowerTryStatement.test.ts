import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { TryTerminatorOp } from "../../ir/ops/control/TryTerminatorOp";
import { DestructureBindingOp } from "../../ir/ops/patterns/DestructureBindingOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerTryStatement", () => {
  it("lowers try, catch, finally, and exit regions", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "try { foo(); } catch (e) { bar(e); } finally { baz(); } qux();"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const op = fn.entryBlock.terminator as TryTerminatorOp;

    expect(op).toBeInstanceOf(TryTerminatorOp);
    expect(op.catchTarget).not.toBeNull();
    expect(op.finallyBlock).not.toBeNull();

    const tryJump = op.tryBlock.terminator as JumpTerminatorOp;
    const catchJump = op.catchTarget!.block.terminator as JumpTerminatorOp;
    const finallyJump = op.finallyBlock!.terminator as JumpTerminatorOp;

    expect(tryJump.targetBlock).toBe(op.finallyBlock);
    expect(catchJump.targetBlock).toBe(op.finallyBlock);
    expect(finallyJump.targetBlock).toBe(op.exitBlock);
    expect(op.catchTarget!.operands.produced).toHaveLength(1);
    expect(op.catchTarget!.block.params).toEqual(op.catchTarget!.operands.produced);
  });

  it("lowers destructured catch parameters", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "try { foo(); } catch ({ message }) { bar(message); }"),
    );
    const fn = moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    const op = fn.entryBlock.terminator as TryTerminatorOp;
    const catchOperations = op.catchTarget!.block.operations;

    expect(catchOperations[0]).toBeInstanceOf(DestructureBindingOp);
    expect(op.catchTarget!.operands.produced).toHaveLength(1);
  });
});
