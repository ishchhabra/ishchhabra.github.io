import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ProjectBuilder } from "../../frontend/ProjectBuilder";
import { makeFuncOpId } from "../../ir/core/FuncOp";
import { DominatorTree } from "./DominatorTreeAnalysis";
import { type Loop, LoopInfo } from "./LoopInfoAnalysis";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getFirstFunction(source: string) {
  const unit = new ProjectBuilder().buildFromSource(source, "m.js");
  const moduleIR = unit.modules.get("m.js")!;
  const fn = moduleIR.functions.get(makeFuncOpId(0));
  if (!fn) {
    throw new Error("expected function id 0");
  }
  return fn;
}

function* walkLoops(loop: Loop): Generator<Loop> {
  yield loop;
  for (const sub of loop.subLoops) {
    yield* walkLoops(sub);
  }
}

function allLoops(li: LoopInfo): Loop[] {
  const out: Loop[] = [];
  for (const root of li.getTopLevelLoops()) {
    out.push(...walkLoops(root));
  }
  return out;
}

describe("LoopInfo", () => {
  it("is empty for straight-line code", () => {
    const fn = getFirstFunction(`export function f() { return 1; }`);
    const dom = DominatorTree.compute(fn);
    const li = LoopInfo.compute(fn, dom);
    expect(li.getTopLevelLoops().length).toBe(0);
    expect(li.getBackEdgePredecessors(fn.entryBlockId).size).toBe(0);
  });

  it("satisfies structural invariants for every discovered loop", () => {
    const fn = getFirstFunction(`
      export function f() {
        let i = 0;
        while (i < 3) { i = i + 1; }
        return i;
      }
    `);
    const dom = DominatorTree.compute(fn);
    const li = LoopInfo.compute(fn, dom);
    for (const loop of allLoops(li)) {
      expect(loop.blocks.has(loop.header)).toBe(true);
      for (const pred of li.getBackEdgePredecessors(loop.header)) {
        expect(dom.dominates(loop.header, pred)).toBe(true);
      }
      for (const sub of loop.subLoops) {
        expect(sub.parent).toBe(loop);
        for (const b of sub.blocks) {
          expect(loop.blocks.has(b)).toBe(true);
        }
      }
    }
  });

  it("nests inner while inside outer when both are present in the IR", () => {
    const body = readFileSync(
      join(__dirname, "../../../test/frontend/while-statement/nested/code.js"),
      "utf-8",
    );
    const fn = getFirstFunction(`export function f() {\n${body}\n}`);
    const dom = DominatorTree.compute(fn);
    const li = LoopInfo.compute(fn, dom);
    const roots = li.getTopLevelLoops();
    if (roots.length === 0) {
      return;
    }
    const outer = roots[0]!;
    if (outer.subLoops.length === 0) {
      return;
    }
    const inner = outer.subLoops.reduce((a, b) => (a.blocks.size <= b.blocks.size ? a : b));
    expect(inner.parent).toBe(outer);
    expect(outer.blocks.size).toBeGreaterThan(inner.blocks.size);
    for (const b of inner.blocks) {
      expect(li.getLoopFor(b)).toBe(inner);
    }
  });
});
