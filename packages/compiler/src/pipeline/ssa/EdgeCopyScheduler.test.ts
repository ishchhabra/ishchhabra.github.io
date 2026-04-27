import { describe, expect, it } from "vitest";
import { Environment } from "../../environment";
import { ProjectEnvironment } from "../../ProjectEnvironment";
import { BindingInitOp, LiteralOp, ReturnTermOp, StoreLocalOp } from "../../ir";
import { Edge } from "../../ir/cfg";
import { FuncOp, makeFuncOpId } from "../../ir/core/FuncOp";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { BranchTermOp, JumpTermOp } from "../../ir/ops/control";
import { DominatorTree } from "../analysis/DominatorTreeAnalysis";
import { EdgeCopyScheduler } from "./EdgeCopyScheduler";

describe("EdgeCopyScheduler", () => {
  it("splits critical edges once for all copies on that edge", () => {
    const env = new Environment(new ProjectEnvironment());
    const moduleIR = new ModuleIR("m.js", env);
    const entry = env.createBlock();
    const join = env.createBlock();
    const other = env.createBlock();

    const cond = env.createValue();
    const a = env.createValue();
    const b = env.createValue();
    const x = env.createValue();
    const y = env.createValue();

    entry.appendOp(env.createOperation(LiteralOp, cond, true));
    entry.appendOp(env.createOperation(LiteralOp, a, 1));
    entry.appendOp(env.createOperation(LiteralOp, b, 2));
    entry.setTerminal(env.createOperation(BranchTermOp, cond, join, other, [a, b], []));
    join.params = [x, y];
    join.setTerminal(env.createOperation(ReturnTermOp, x));
    other.setTerminal(env.createOperation(ReturnTermOp, b));

    const funcOp = new FuncOp(moduleIR, makeFuncOpId(env.nextOperationId++), [], false, false, [
      entry,
      join,
      other,
    ]);

    const scheduler = new EdgeCopyScheduler(funcOp, moduleIR, DominatorTree.compute(funcOp));
    const edge = new Edge(entry, 0, funcOp);
    scheduler.add(edge, x, a);
    scheduler.add(edge, y, b);
    scheduler.emit();

    const terminal = entry.terminal;
    expect(terminal).toBeInstanceOf(BranchTermOp);
    const branch = terminal as BranchTermOp;
    expect(branch.trueTarget).not.toBe(join);
    expect(branch.trueArgs).toHaveLength(0);
    expect(branch.trueTarget.operations.filter((op) => op instanceof StoreLocalOp)).toHaveLength(2);
    expect(branch.trueTarget.terminal).toBeInstanceOf(JumpTermOp);
  });

  it("uses one temporary to break a swap cycle", () => {
    const env = new Environment(new ProjectEnvironment());
    const moduleIR = new ModuleIR("m.js", env);
    const entry = env.createBlock();
    const join = env.createBlock();

    const x = env.createValue();
    const y = env.createValue();
    entry.setTerminal(env.createOperation(JumpTermOp, join, [y, x]));
    join.params = [x, y];
    join.setTerminal(env.createOperation(ReturnTermOp, x));

    const funcOp = new FuncOp(moduleIR, makeFuncOpId(env.nextOperationId++), [], false, false, [
      entry,
      join,
    ]);

    const scheduler = new EdgeCopyScheduler(funcOp, moduleIR, DominatorTree.compute(funcOp));
    const edge = new Edge(entry, 0, funcOp);
    scheduler.add(edge, x, y);
    scheduler.add(edge, y, x);
    scheduler.emit();

    expect(entry.operations.filter((op) => op instanceof BindingInitOp)).toHaveLength(1);
    expect(entry.operations.filter((op) => op instanceof StoreLocalOp)).toHaveLength(2);

    const firstStore = entry.operations[1] as StoreLocalOp;
    const secondStore = entry.operations[2] as StoreLocalOp;
    expect(firstStore.lval).toBe(x);
    expect(firstStore.value).toBe(y);
    expect(secondStore.lval).toBe(y);
    expect(secondStore.value).not.toBe(x);
  });

  it("does not create a temporary for acyclic overlapping copies", () => {
    const env = new Environment(new ProjectEnvironment());
    const moduleIR = new ModuleIR("m.js", env);
    const entry = env.createBlock();
    const join = env.createBlock();

    const x = env.createValue();
    const y = env.createValue();
    const z = env.createValue();
    entry.setTerminal(env.createOperation(JumpTermOp, join, [y, z]));
    join.params = [x, y];
    join.setTerminal(env.createOperation(ReturnTermOp, x));

    const funcOp = new FuncOp(moduleIR, makeFuncOpId(env.nextOperationId++), [], false, false, [
      entry,
      join,
    ]);

    const scheduler = new EdgeCopyScheduler(funcOp, moduleIR, DominatorTree.compute(funcOp));
    const edge = new Edge(entry, 0, funcOp);
    scheduler.add(edge, x, y);
    scheduler.add(edge, y, z);
    scheduler.emit();

    expect(entry.operations.filter((op) => op instanceof BindingInitOp)).toHaveLength(0);
    expect(entry.operations.filter((op) => op instanceof StoreLocalOp)).toHaveLength(2);
  });
});
