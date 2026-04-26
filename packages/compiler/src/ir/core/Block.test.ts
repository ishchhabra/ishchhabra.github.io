import { describe, expect, it } from "vitest";
import { Environment } from "../../environment";
import { ProjectEnvironment } from "../../ProjectEnvironment";
import { createOperationId } from "../utils";
import { JumpTermOp } from "../ops/control";
import { TermOp } from "./TermOp";

describe("BasicBlock.setTerminal", () => {
  function makeEnv(): Environment {
    return new Environment(new ProjectEnvironment());
  }

  it("assigns when the block has no terminal", () => {
    const env = makeEnv();
    const block = env.createBlock();
    const target = env.createBlock();
    const jump = new JumpTermOp(createOperationId(env), target, []);
    block.setTerminal(jump);
    expect(block.terminal).toBe(jump);
  });

  it("throws when the block already has a terminal", () => {
    const env = makeEnv();
    const block = env.createBlock();
    const target = env.createBlock();
    block.setTerminal(new JumpTermOp(createOperationId(env), target, []));
    expect(() => block.setTerminal(new JumpTermOp(createOperationId(env), target, []))).toThrow(
      /already has terminal/,
    );
  });

  it("throw message names the block id and both terminator classes", () => {
    const env = makeEnv();
    const block = env.createBlock();
    const target = env.createBlock();
    block.setTerminal(new JumpTermOp(createOperationId(env), target, []));
    expect(() => block.setTerminal(new JumpTermOp(createOperationId(env), target, []))).toThrow(
      new RegExp(`Block ${block.id}.*JumpTermOp.*JumpTermOp`),
    );
  });
});

describe("TermOp successors", () => {
  function makeEnv(): Environment {
    return new Environment(new ProjectEnvironment());
  }

  it("derives block refs from indexed successors", () => {
    const env = makeEnv();
    const target = env.createBlock();
    const jump = new JumpTermOp(createOperationId(env), target, []);
    expect(jump.targetCount()).toBe(1);
    expect(jump.target(0)).toEqual({ block: target, args: [] });
    expect(jump.targets().map((successor) => successor.block)).toEqual([target]);
  });

  it("remaps successor slots through block replacement", () => {
    const env = makeEnv();
    const block = env.createBlock();
    const targetA = env.createBlock();
    const targetB = env.createBlock();
    const jump = new JumpTermOp(createOperationId(env), targetA, []);
    block.setTerminal(jump);

    jump.remap(targetA, targetB);

    expect(block.terminal).toBeInstanceOf(TermOp);
    expect((block.terminal as JumpTermOp).targetBlock).toBe(targetB);
    expect(targetA.predecessors().has(block)).toBe(false);
    expect(targetB.predecessors().has(block)).toBe(true);
  });
});

describe("BasicBlock.replaceTerminal", () => {
  function makeEnv(): Environment {
    return new Environment(new ProjectEnvironment());
  }

  it("swaps the terminator for a new one", () => {
    const env = makeEnv();
    const block = env.createBlock();
    const target = env.createBlock();
    const first = new JumpTermOp(createOperationId(env), target, []);
    const second = new JumpTermOp(createOperationId(env), target, []);
    block.setTerminal(first);
    block.replaceTerminal(second);
    expect(block.terminal).toBe(second);
  });

  it("throws when the block has no terminator to replace", () => {
    const env = makeEnv();
    const block = env.createBlock();
    const target = env.createBlock();
    expect(() => block.replaceTerminal(new JumpTermOp(createOperationId(env), target, []))).toThrow(
      /no terminal to replace/,
    );
  });

  it("unregisters the old terminator from its target's use-list", () => {
    const env = makeEnv();
    const block = env.createBlock();
    const targetA = env.createBlock();
    const targetB = env.createBlock();
    const first = new JumpTermOp(createOperationId(env), targetA, []);
    const second = new JumpTermOp(createOperationId(env), targetB, []);
    block.setTerminal(first);
    expect(targetA.predecessors().has(block)).toBe(true);
    block.replaceTerminal(second);
    expect(targetA.predecessors().has(block)).toBe(false);
    expect(targetB.predecessors().has(block)).toBe(true);
  });
});
