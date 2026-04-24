import { describe, expect, it } from "vitest";
import type { MemberExpression, Node } from "oxc-parser";
import { LoadDynamicPropertyOp, LoadStaticPropertyOp, SuperPropertyOp } from "../../../ir";
import { ProjectBuilder } from "../../ProjectBuilder";
import { buildFn, findAstNode, makeIsolatedHarness, printFn, printOps } from "../__testing__/ir";
import { buildMemberExpression } from "./buildMemberExpression";

function buildMemberFromSource(source: string): {
  harness: ReturnType<typeof makeIsolatedHarness>;
  op: LoadStaticPropertyOp | LoadDynamicPropertyOp;
} {
  const harness = makeIsolatedHarness(source);
  const node = findAstNode(
    harness.program,
    (n: Node): n is MemberExpression => n.type === "MemberExpression",
  );
  buildMemberExpression(node, harness.scope, harness.fnBuilder, harness.moduleBuilder, harness.env);
  const ops = harness.fnBuilder.currentBlock.operations;
  const op = ops[ops.length - 1];
  if (!(op instanceof LoadStaticPropertyOp) && !(op instanceof LoadDynamicPropertyOp)) {
    throw new Error(`expected static/dynamic property load, got ${op.constructor.name}`);
  }
  return { harness, op };
}

// -----------------------------------------------------------------
// End-to-end smoke
// -----------------------------------------------------------------

describe("buildMemberExpression — end-to-end smoke", () => {
  it("renders through the full HIR pipeline", () => {
    expect(printFn(buildFn("o.x;"))).toBe(
      ["bb0:", "  $0 = LoadGlobal o", '  $1 = load_static_property $0, "x"'].join("\n"),
    );
  });
});

// -----------------------------------------------------------------
// Isolated
// -----------------------------------------------------------------

describe("buildMemberExpression — isolated", () => {
  describe("static property", () => {
    it("lowers `o.x` to load_static_property", () => {
      const { harness } = buildMemberFromSource("o.x;");
      expect(printOps(harness.fnBuilder.currentBlock.operations)).toBe(
        ["$0 = LoadGlobal o", '$1 = load_static_property $0, "x"'].join("\n"),
      );
    });

    it("preserves the optional-chaining attribute for `o?.x`", () => {
      const { harness, op } = buildMemberFromSource("o?.x;");
      expect(op).toBeInstanceOf(LoadStaticPropertyOp);
      expect((op as LoadStaticPropertyOp).optional).toBe(true);
      expect(printOps(harness.fnBuilder.currentBlock.operations)).toBe(
        ["$0 = LoadGlobal o", '$1 = load_static_property $0, "x" {optional}'].join("\n"),
      );
    });

    it("normalizes `o[1]` (numeric-literal key) to a static load with string property", () => {
      // JS property keys are always strings; numeric-literal keys
      // carry the canonical string representation. The builder
      // folds this at HIR time so downstream passes see one shape.
      const { harness, op } = buildMemberFromSource("o[1];");
      expect(op).toBeInstanceOf(LoadStaticPropertyOp);
      expect((op as LoadStaticPropertyOp).property).toBe("1");
      expect(printOps(harness.fnBuilder.currentBlock.operations)).toBe(
        ["$0 = LoadGlobal o", '$1 = load_static_property $0, "1"'].join("\n"),
      );
    });
  });

  describe("dynamic property", () => {
    it("lowers `o[k]` to load_dynamic_property", () => {
      const { harness } = buildMemberFromSource("o[k];");
      expect(printOps(harness.fnBuilder.currentBlock.operations)).toBe(
        ["$0 = LoadGlobal o", "$1 = LoadGlobal k", "$2 = load_dynamic_property $0, $1"].join("\n"),
      );
    });

    it("preserves the optional-chaining attribute for `o?.[k]`", () => {
      const { harness, op } = buildMemberFromSource("o?.[k];");
      expect(op).toBeInstanceOf(LoadDynamicPropertyOp);
      expect((op as LoadDynamicPropertyOp).optional).toBe(true);
      expect(printOps(harness.fnBuilder.currentBlock.operations)).toBe(
        [
          "$0 = LoadGlobal o",
          "$1 = LoadGlobal k",
          "$2 = load_dynamic_property $0, $1 {optional}",
        ].join("\n"),
      );
    });
  });

  describe("semantics", () => {
    it("static load wires object to the sub-build result place", () => {
      const { harness, op } = buildMemberFromSource("o.x;");
      const [load] = harness.fnBuilder.currentBlock.operations;
      expect((op as LoadStaticPropertyOp).object).toBe(load.place);
    });

    it("dynamic load wires object and property operands", () => {
      const { harness, op } = buildMemberFromSource("o[k];");
      const [loadO, loadK] = harness.fnBuilder.currentBlock.operations;
      expect((op as LoadDynamicPropertyOp).object).toBe(loadO.place);
      expect((op as LoadDynamicPropertyOp).property).toBe(loadK.place);
    });

    it("operands returns [object] for static load", () => {
      const { op } = buildMemberFromSource("o.x;");
      expect(op.operands()).toEqual([(op as LoadStaticPropertyOp).object]);
    });

    it("operands returns [object, property] for dynamic load", () => {
      const { op } = buildMemberFromSource("o[k];");
      const dyn = op as LoadDynamicPropertyOp;
      expect(op.operands()).toEqual([dyn.object, dyn.property]);
    });

    it("both static and dynamic loads report side effects", () => {
      // Property reads can invoke getters, trigger Proxy traps, or
      // throw on null/undefined receivers. Shared base keeps the
      // two variants symmetric.
      const { op: staticOp } = buildMemberFromSource("o.x;");
      const { op: dynOp } = buildMemberFromSource("o[k];");
      expect(staticOp.hasSideEffects()).toBe(true);
      expect(dynOp.hasSideEffects()).toBe(true);
    });
  });
});

// -----------------------------------------------------------------
// super — requires a class-method context, so tested end-to-end
// by walking `moduleIR.functions` to reach the method's FuncOp.
// -----------------------------------------------------------------

describe("buildMemberExpression — super", () => {
  function methodIR(source: string): string {
    const unit = new ProjectBuilder().buildFromSource(source, "m.js");
    const mod = unit.modules.get("m.js")!;
    for (const fn of mod.functions.values()) {
      for (const block of fn.allBlocks()) {
        for (const op of block.operations) {
          if (op instanceof SuperPropertyOp) return printFn(fn);
        }
      }
    }
    throw new Error("no super_property op found");
  }

  it("`super.foo` emits super_property with a literal key", () => {
    expect(methodIR("class C extends B { m() { return super.foo; } }")).toBe(
      ["bb1:", '  $3 = "foo"', "  $4 = super_property $3", "  return $4"].join("\n"),
    );
  });

  it("`super[k]` emits super_property with {computed}", () => {
    expect(methodIR("class C extends B { m() { return super[k]; } }")).toBe(
      ["bb1:", "  $3 = LoadGlobal k", "  $4 = super_property $3 {computed}", "  return $4"].join(
        "\n",
      ),
    );
  });
});
