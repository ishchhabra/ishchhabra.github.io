import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../core/IRIdAllocator";
import { makeOperationId } from "../../core/Operation";
import { makeDeclarationId } from "../../core/Value";
import { block, value } from "../../core/testing";
import { bindingMemoryLocation } from "../../effects";
import { InitializeBindingOp } from "./InitializeBindingOp";

describe("InitializeBindingOp", () => {
  it("stores its declaration id and initializer value", () => {
    const declarationId = makeDeclarationId(1);
    const initializer = value(1);
    const bindingValue = value(2, declarationId);
    const op = new InitializeBindingOp(
      makeOperationId(1),
      declarationId,
      initializer,
      bindingValue,
    );

    expect(op.declarationId).toBe(declarationId);
    expect(op.value).toBe(initializer);
    expect(op.bindingValue).toBe(bindingValue);
    expect(op.results).toEqual([bindingValue]);
    expect(op.operands()).toEqual([initializer]);
  });

  it("updates operand use-list when attached to a block", () => {
    const declarationId = makeDeclarationId(1);
    const initializer = value(1);
    const bindingValue = value(2, declarationId);
    const op = new InitializeBindingOp(
      makeOperationId(1),
      declarationId,
      initializer,
      bindingValue,
    );

    block(1).appendOp(op);

    expect(initializer.users.has(op)).toBe(true);
    expect(bindingValue.definer).toBe(op);
  });

  it("writes binding memory and may throw", () => {
    const declarationId = makeDeclarationId(1);
    const op = new InitializeBindingOp(
      makeOperationId(1),
      declarationId,
      value(1),
      value(2, declarationId),
    );

    expect(op.effects()).toEqual({
      memory: {
        reads: [],
        writes: [bindingMemoryLocation(declarationId)],
      },
      mayThrow: true,
      mayDiverge: false,
      isObservable: true,
    });
  });

  it("returns itself when replacement operands are unchanged", () => {
    const initializer = value(1);
    const declarationId = makeDeclarationId(1);
    const op = new InitializeBindingOp(
      makeOperationId(1),
      declarationId,
      initializer,
      value(2, declarationId),
    );

    expect(op.withOperands([initializer])).toBe(op);
  });

  it("returns a same-declaration copy with a replacement initializer", () => {
    const declarationId = makeDeclarationId(1);
    const bindingValue = value(2, declarationId);
    const op = new InitializeBindingOp(
      makeOperationId(1),
      declarationId,
      value(1),
      bindingValue,
    );
    const nextInitializer = value(2);
    const replacement = op.withOperands([nextInitializer]);

    expect(replacement).not.toBe(op);
    expect(replacement.id).toBe(op.id);
    expect(replacement.declarationId).toBe(declarationId);
    expect(replacement.value).toBe(nextInitializer);
    expect(replacement.bindingValue).toBe(bindingValue);
  });

  it("rejects replacement operands with the wrong arity", () => {
    const declarationId = makeDeclarationId(1);
    const op = new InitializeBindingOp(
      makeOperationId(1),
      declarationId,
      value(1),
      value(2, declarationId),
    );

    expect(() => op.withOperands([])).toThrow("expected 1 operand, got 0");
  });

  it("clones with a fresh id and remapped initializer", () => {
    const declarationId = makeDeclarationId(1);
    const initializer = value(1);
    const clonedInitializer = value(2);
    const bindingValue = value(3, declarationId);
    const clonedBindingValue = value(4, declarationId);
    const op = new InitializeBindingOp(
      makeOperationId(1),
      declarationId,
      initializer,
      bindingValue,
    );

    const clone = op.clone({
      ids: new IRIdAllocator(),
      value: (candidate) => {
        if (candidate === initializer) return clonedInitializer;
        throw new Error(`Unexpected operand ${candidate.id}`);
      },
      result: (candidate) => {
        if (candidate === bindingValue) return clonedBindingValue;
        throw new Error(`Unexpected result ${candidate.id}`);
      },
      block: (candidate) => candidate,
    });

    expect(clone.id).not.toBe(op.id);
    expect(clone.declarationId).toBe(declarationId);
    expect(clone.value).toBe(clonedInitializer);
    expect(clone.bindingValue).toBe(clonedBindingValue);
  });
});
