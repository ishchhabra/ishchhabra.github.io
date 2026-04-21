import { describe, expect, it } from "vitest";
import { ProjectBuilder } from "../../frontend/ProjectBuilder";
import { LoadLocalOp, LoadStaticPropertyOp, StoreLocalOp, StoreStaticPropertyOp } from "../../ir";
import { Operation } from "../../ir/core/Operation";
import { Pipeline } from "../Pipeline";
import { MemoryStateWalker } from "./MemoryStateWalker";

function compile(source: string) {
  const unit = new ProjectBuilder().buildFromSource(source, "m.js");
  const moduleIR = unit.modules.get("m.js")!;
  const funcOp = moduleIR.entryFuncOp!;
  new Pipeline(unit, {
    enableOptimizer: false,
    enableLateOptimizer: false,
    enableAlgebraicSimplificationPass: false,
    enableReassociationPass: false,
    enableConstantPropagationPass: false,
    enableExpressionInliningPass: false,
    enableUnusedExportEliminationPass: false,
    enableCapturePruningPass: false,
    enableDeadCodeEliminationPass: false,
    enableLateCopyPropagationPass: false,
    enableLateDeadStoreEliminationPass: false,
    enableLateDeadCodeEliminationPass: false,
    enableScalarReplacementOfAggregatesPass: false,
    enableExportDeclarationMergingPass: false,
  }).run();
  return { unit, moduleIR, funcOp };
}

function findAllOps<T extends Operation>(
  funcOp: ReturnType<typeof compile>["funcOp"],
  cls: new (...args: never[]) => T,
): T[] {
  const out: T[] = [];
  for (const block of funcOp.allBlocks()) {
    for (const op of block.operations) {
      if (op instanceof cls) out.push(op);
    }
  }
  return out;
}

describe("MemoryStateWalker", () => {
  it("reachingStore: captured-local load sees the last prior store", () => {
    // SSABuilder mem2reg elides LoadLocals for simple scalars, so
    // the walker's scalar-read reasoning is covered by pure SSA
    // def-use. The walker still earns its keep on bindings that
    // stay memory-form: captures, context bindings, properties.
    const { funcOp } = compile(`
      const x = 1;
      const leak = () => x;
      console.log(x);
      leak();
    `);
    const walker = new MemoryStateWalker(funcOp);
    const loads = findAllOps(funcOp, LoadLocalOp);
    const stores = findAllOps(funcOp, StoreLocalOp);
    expect(loads.length).toBeGreaterThanOrEqual(1);
    expect(stores.length).toBeGreaterThanOrEqual(1);

    const load = loads[0];
    const fx = load.getMemoryEffects(funcOp.moduleIR.environment);
    const loadLoc = fx.reads[0];
    const reaching = walker.reachingStore(load, loadLoc);
    expect(reaching).toBeDefined();
    expect(stores.some((s) => s === reaching)).toBe(true);
  });

  it("reachingStore: load with no prior store returns undefined (LiveOnEntry)", () => {
    // Build a function where a load has no prior writer in its function.
    const { moduleIR } = compile(`
      function f(o) { return o.x; }
      f({});
    `);
    const fn = [...moduleIR.functions.values()].find((f) => f !== moduleIR.entryFuncOp);
    expect(fn).toBeDefined();
    const walker = new MemoryStateWalker(fn!);
    const loads = findAllOps(fn!, LoadStaticPropertyOp);
    if (loads.length > 0) {
      const load = loads[0];
      const fx = load.getMemoryEffects(fn!.moduleIR.environment as never);
      const reaching = walker.reachingStore(load, fx.reads[0]);
      // No reaching store in this function — LiveOnEntry semantics.
      expect(reaching).toBeUndefined();
    }
  });

  it("property category: a store to o.x does not hide a captured-local read of x", () => {
    const { funcOp } = compile(`
      const x = 1;
      const o = {};
      o.x = 99;
      const leak = () => x;
      console.log(x);
      leak();
    `);
    const walker = new MemoryStateWalker(funcOp);
    const localLoads = findAllOps(funcOp, LoadLocalOp);
    // Find the load of x (not o).
    const xLoad = localLoads.find((l) => {
      const fx = l.getMemoryEffects(funcOp.moduleIR.environment);
      return fx.reads.some((r) => r.kind === "local");
    });
    expect(xLoad).toBeDefined();
    const fx = xLoad!.getMemoryEffects(funcOp.moduleIR.environment);
    const localLoc = fx.reads.find((r) => r.kind === "local")!;
    const reaching = walker.reachingStore(xLoad!, localLoc);
    // The store to o.x is in a different category (property vs local) —
    // must NOT be returned as the reaching store for x.
    expect(reaching).toBeDefined();
    const reachingFx = reaching!.getMemoryEffects(funcOp.moduleIR.environment);
    expect(reachingFx.writes.some((w) => w.kind === "local")).toBe(true);
    expect(reachingFx.writes.some((w) => w.kind === "staticProperty")).toBe(false);
  });

  it("pure ops never appear as reaching stores", () => {
    const { funcOp } = compile(`var a = 1 + 2;`);
    const walker = new MemoryStateWalker(funcOp);
    // Query a location that can't exist (bogus declarationId). No
    // op should be returned as the reaching store for it.
    const bogusLoc = { kind: "local", declarationId: 99999 as never } as const;
    for (const block of funcOp.allBlocks()) {
      for (const op of block.operations) {
        const fx = op.getMemoryEffects(funcOp.moduleIR.environment);
        if (fx.reads.length === 0 && fx.writes.length === 0) {
          expect(walker.reachingStore(op, bogusLoc)).toBeUndefined();
        }
      }
    }
  });
});
