import { describe, expect, it } from "vitest";
import { ProjectBuilder } from "../../frontend/ProjectBuilder";
import { makeFuncOpId } from "../../ir/core/FuncOp";
import { ControlFlowGraph } from "./ControlFlowGraphAnalysis";
import { DominatorTree } from "./DominatorTreeAnalysis";

function getFirstFunction(source: string) {
  const unit = new ProjectBuilder().buildFromSource(source, "m.js");
  const moduleIR = unit.modules.get("m.js")!;
  const fn = moduleIR.functions.get(makeFuncOpId(0));
  if (!fn) {
    throw new Error("expected function id 0");
  }
  return fn;
}

describe("DominatorTree", () => {
  it("matches entry as root and has entry dominate every reachable block", () => {
    const fn = getFirstFunction(`
      export function f() {
        let x = 1;
        if (x) { x = 2; } else { x = 3; }
        return x;
      }
    `);
    const cfg = ControlFlowGraph.compute(fn);
    const dom = DominatorTree.compute(fn, cfg);
    const root = fn.entryBlockId;
    expect(dom.getRoot()).toBe(root);
    expect(dom.getImmediateDominator(root)).toBeUndefined();
    for (const blockId of fn.blockIds()) {
      expect(dom.dominates(root, blockId)).toBe(true);
      expect(dom.dominates(blockId, blockId)).toBe(true);
    }
  });

  it("findNearestCommonDominator returns the shared ancestor on the idom tree", () => {
    const fn = getFirstFunction(`
      export function f() {
        let a = 1;
        if (a) { a = 2; } else { a = 3; }
        return a;
      }
    `);
    const cfg = ControlFlowGraph.compute(fn);
    const dom = DominatorTree.compute(fn, cfg);
    const root = fn.entryBlockId;
    for (const blockId of fn.blockIds()) {
      expect(dom.findNearestCommonDominator(root, blockId)).toBe(root);
    }
  });

  it("assigns an immediate dominator to every block except the entry", () => {
    const fn = getFirstFunction(`
      export function f() {
        let x = 1;
        if (x) { x = 2; } else { x = 3; }
        return x;
      }
    `);
    const cfg = ControlFlowGraph.compute(fn);
    const dom = DominatorTree.compute(fn, cfg);
    const root = fn.entryBlockId;
    for (const blockId of fn.blockIds()) {
      const idom = dom.getImmediateDominator(blockId);
      if (blockId === root) {
        expect(idom).toBeUndefined();
      } else {
        expect(idom).toBeDefined();
      }
    }
  });
});
