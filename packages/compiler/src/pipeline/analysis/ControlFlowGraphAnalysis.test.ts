import type { BlockId } from "../../ir";
import { describe, expect, it } from "vitest";
import { ProjectBuilder } from "../../frontend/ProjectBuilder";
import { makeFunctionIRId } from "../../ir/core/FunctionIR";
import { AnalysisManager } from "./AnalysisManager";
import { ControlFlowGraph, ControlFlowGraphAnalysis } from "./ControlFlowGraphAnalysis";

function getFirstFunction(source: string) {
  const unit = new ProjectBuilder().buildFromSource(source, "m.js");
  const moduleIR = unit.modules.get("m.js")!;
  const fn = moduleIR.functions.get(makeFunctionIRId(0));
  if (!fn) {
    throw new Error("expected function id 0");
  }
  return fn;
}

describe("ControlFlowGraph", () => {
  it("ControlFlowGraphAnalysis matches ControlFlowGraph.compute", () => {
    const fn = getFirstFunction(`
      export function f() {
        let x = 1;
        if (x) { x = 2; } else { x = 3; }
        return x;
      }
    `);
    const direct = ControlFlowGraph.compute(fn);
    const am = new AnalysisManager();
    const cached = am.get(ControlFlowGraphAnalysis, fn);
    expect(cached.predecessors.size).toBe(direct.predecessors.size);
    const sortIds = (a: BlockId, b: BlockId) => a - b;
    for (const id of fn.blockIds()) {
      expect([...(cached.predecessors.get(id) ?? [])].sort(sortIds)).toEqual(
        [...(direct.predecessors.get(id) ?? [])].sort(sortIds),
      );
      expect([...(cached.successors.get(id) ?? [])].sort(sortIds)).toEqual(
        [...(direct.successors.get(id) ?? [])].sort(sortIds),
      );
    }
  });

  it("getExitBlockId is the block with no successors", () => {
    const fn = getFirstFunction(`export function f() { return 1; }`);
    const cfg = ControlFlowGraph.compute(fn);
    expect(cfg.successors.get(cfg.getExitBlockId())?.size).toBe(0);
  });
});
