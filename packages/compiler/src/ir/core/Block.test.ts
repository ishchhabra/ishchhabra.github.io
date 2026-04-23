import { describe, expect, it } from "vitest";
import { Environment } from "../../environment";
import { ProjectEnvironment } from "../../ProjectEnvironment";
import { createOperationId } from "../utils";
import { JumpOp } from "../ops/control";

describe("BasicBlock.setTerminal", () => {
  function makeEnv(): Environment {
    return new Environment(new ProjectEnvironment());
  }

  it("assigns when the block has no terminal", () => {
    const env = makeEnv();
    const block = env.createBlock();
    const target = env.createBlock();
    const jump = new JumpOp(createOperationId(env), target, []);
    block.setTerminal(jump);
    expect(block.terminal).toBe(jump);
  });

  it("throws when the block already has a terminal", () => {
    const env = makeEnv();
    const block = env.createBlock();
    const target = env.createBlock();
    block.setTerminal(new JumpOp(createOperationId(env), target, []));
    expect(() =>
      block.setTerminal(new JumpOp(createOperationId(env), target, [])),
    ).toThrow(/already has terminal/);
  });

  it("throw message names the block id and both terminator classes", () => {
    const env = makeEnv();
    const block = env.createBlock();
    const target = env.createBlock();
    block.setTerminal(new JumpOp(createOperationId(env), target, []));
    expect(() =>
      block.setTerminal(new JumpOp(createOperationId(env), target, [])),
    ).toThrow(new RegExp(`Block ${block.id}.*JumpOp.*JumpOp`));
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
    const first = new JumpOp(createOperationId(env), target, []);
    const second = new JumpOp(createOperationId(env), target, []);
    block.setTerminal(first);
    block.replaceTerminal(second);
    expect(block.terminal).toBe(second);
  });

  it("throws when the block has no terminator to replace", () => {
    const env = makeEnv();
    const block = env.createBlock();
    const target = env.createBlock();
    expect(() =>
      block.replaceTerminal(new JumpOp(createOperationId(env), target, [])),
    ).toThrow(/no terminal to replace/);
  });

  it("unregisters the old terminator from its target's use-list", () => {
    const env = makeEnv();
    const block = env.createBlock();
    const targetA = env.createBlock();
    const targetB = env.createBlock();
    const first = new JumpOp(createOperationId(env), targetA, []);
    const second = new JumpOp(createOperationId(env), targetB, []);
    block.setTerminal(first);
    expect(targetA.predecessors().has(block)).toBe(true);
    block.replaceTerminal(second);
    expect(targetA.predecessors().has(block)).toBe(false);
    expect(targetB.predecessors().has(block)).toBe(true);
  });
});
