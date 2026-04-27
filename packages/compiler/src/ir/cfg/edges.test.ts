import { describe, expect, it } from "vitest";
import { Environment } from "../../environment";
import { ProjectEnvironment } from "../../ProjectEnvironment";
import { FuncOp, makeFuncOpId } from "../core/FuncOp";
import { ModuleIR } from "../core/ModuleIR";
import { valueBlockTarget } from "../core/TermOp";
import { JumpTermOp } from "../ops/control";
import { Edge, threadEdgeThroughEmptyJump } from "./edges";

describe("threadEdgeThroughEmptyJump", () => {
  it("composes block params into successor args", () => {
    const env = new Environment(new ProjectEnvironment());
    const moduleIR = new ModuleIR("m.js", env);
    const pred = env.createBlock();
    const middle = env.createBlock();
    const dest = env.createBlock();

    const incoming = env.createValue();
    const middleParam = env.createValue();
    const destParam = env.createValue();

    middle.params = [middleParam];
    dest.params = [destParam];

    pred.setTerminal(env.createOperation(JumpTermOp, valueBlockTarget(middle, [incoming])));
    middle.setTerminal(env.createOperation(JumpTermOp, valueBlockTarget(dest, [middleParam])));

    const funcOp = new FuncOp(moduleIR, makeFuncOpId(env.nextOperationId++), [], false, false, [
      pred,
      middle,
      dest,
    ]);

    expect(threadEdgeThroughEmptyJump(new Edge(pred, 0, funcOp))).toBe(true);

    const terminal = pred.terminal;
    expect(terminal).toBeInstanceOf(JumpTermOp);
    expect((terminal as JumpTermOp).targetBlock).toBe(dest);
    expect((terminal as JumpTermOp).args).toEqual([incoming]);
  });
});
