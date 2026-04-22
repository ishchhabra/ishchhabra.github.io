import { describe, expect, it } from "vitest";
import type { CallExpression, Node } from "oxc-parser";
import {
  CallExpressionOp,
  LiteralOp,
  LoadDynamicPropertyOp,
  LoadGlobalOp,
  LoadStaticPropertyOp,
  SpreadElementOp,
  SuperCallOp,
} from "../../../ir";
import { ProjectBuilder } from "../../ProjectBuilder";
import { buildFn, findAstNode, makeIsolatedHarness, printFn } from "../__testing__/ir";
import { buildCallExpression } from "./buildCallExpression";

function buildCallFromSource(source: string) {
  const harness = makeIsolatedHarness(source);
  const node = findAstNode(
    harness.program,
    (n: Node): n is CallExpression => n.type === "CallExpression",
  );
  const opsBefore = harness.fnBuilder.currentBlock.operations.length;
  buildCallExpression(node, harness.scope, harness.fnBuilder, harness.moduleBuilder, harness.env);
  const opsAdded = harness.fnBuilder.currentBlock.operations.slice(opsBefore);
  return { harness, opsAdded };
}

// -----------------------------------------------------------------
// End-to-end smoke
// -----------------------------------------------------------------

describe("buildCallExpression — end-to-end smoke", () => {
  it("zero-arg call: `f();`", () => {
    expect(printFn(buildFn("f();"))).toBe(
      ["bb0:", "  $0 = LoadGlobal f", "  $1 = call $0()"].join("\n"),
    );
  });

  it("method call: `obj.m(1, 2);`", () => {
    expect(printFn(buildFn("obj.m(1, 2);"))).toBe(
      [
        "bb0:",
        "  $0 = LoadGlobal obj",
        '  $1 = load_static_property $0, "m"',
        "  $2 = 1",
        "  $3 = 2",
        "  $4 = call $1($2, $3)",
      ].join("\n"),
    );
  });
});

// -----------------------------------------------------------------
// Isolated
// -----------------------------------------------------------------

describe("buildCallExpression — isolated", () => {
  describe("callee shapes", () => {
    it("identifier callee → LoadGlobal + Call", () => {
      const { opsAdded } = buildCallFromSource("f();");
      expect(opsAdded.length).toBe(2);
      expect(opsAdded[0]).toBeInstanceOf(LoadGlobalOp);
      expect(opsAdded[1]).toBeInstanceOf(CallExpressionOp);
      expect((opsAdded[1] as CallExpressionOp).callee).toBe(opsAdded[0].place);
    });

    it("static member callee → load_static_property + Call (keeps the property-read inlined as callee)", () => {
      const { opsAdded } = buildCallFromSource("obj.m();");
      const load = opsAdded.find(
        (o): o is LoadStaticPropertyOp => o instanceof LoadStaticPropertyOp,
      )!;
      const call = opsAdded.find(
        (o): o is CallExpressionOp => o instanceof CallExpressionOp,
      )!;
      expect(call.callee).toBe(load.place);
      expect(load.property).toBe("m");
    });

    it("dynamic member callee → load_dynamic_property + Call", () => {
      const { opsAdded } = buildCallFromSource("obj[k]();");
      const load = opsAdded.find(
        (o): o is LoadDynamicPropertyOp => o instanceof LoadDynamicPropertyOp,
      )!;
      const call = opsAdded.find(
        (o): o is CallExpressionOp => o instanceof CallExpressionOp,
      )!;
      expect(call.callee).toBe(load.place);
    });
  });

  describe("arguments", () => {
    it("zero args: args array is empty", () => {
      const { opsAdded } = buildCallFromSource("f();");
      const call = opsAdded.find(
        (o): o is CallExpressionOp => o instanceof CallExpressionOp,
      )!;
      expect(call.args).toEqual([]);
    });

    it("multiple args: in source order", () => {
      const { opsAdded } = buildCallFromSource("f(1, 2, 3);");
      const literals = opsAdded.filter(
        (o): o is LiteralOp => o instanceof LiteralOp,
      );
      const call = opsAdded.find(
        (o): o is CallExpressionOp => o instanceof CallExpressionOp,
      )!;
      expect(literals.length).toBe(3);
      expect(call.args.length).toBe(3);
      expect(call.args[0]).toBe(literals[0].place);
      expect(call.args[1]).toBe(literals[1].place);
      expect(call.args[2]).toBe(literals[2].place);
      expect(literals.map((l) => l.value)).toEqual([1, 2, 3]);
    });

    it("arguments evaluate before the call op", () => {
      // Side-effectful arg expressions must lower to ops BEFORE the
      // Call op in block order — left-to-right JS evaluation.
      const { opsAdded } = buildCallFromSource("f(g(), h());");
      const callOps = opsAdded.filter(
        (o): o is CallExpressionOp => o instanceof CallExpressionOp,
      );
      // Three calls total: g(), h(), then f(...).
      expect(callOps.length).toBe(3);
      // The outer call is the last one.
      const outer = callOps[callOps.length - 1];
      // Outer call's args are the results of g() and h() in order.
      expect(outer.args[0]).toBe(callOps[0].place);
      expect(outer.args[1]).toBe(callOps[1].place);
    });

    it("spread argument: `f(...args)` emits a SpreadElementOp in the args", () => {
      const { opsAdded } = buildCallFromSource("f(...args);");
      const spread = opsAdded.find(
        (o): o is SpreadElementOp => o instanceof SpreadElementOp,
      )!;
      const call = opsAdded.find(
        (o): o is CallExpressionOp => o instanceof CallExpressionOp,
      )!;
      expect(spread).toBeDefined();
      expect(call.args.length).toBe(1);
      expect(call.args[0]).toBe(spread.place);
    });
  });

  describe("optional call", () => {
    it("`f?.()` sets `optional = true` on the CallExpressionOp", () => {
      const { opsAdded } = buildCallFromSource("f?.();");
      const call = opsAdded.find(
        (o): o is CallExpressionOp => o instanceof CallExpressionOp,
      )!;
      expect(call.optional).toBe(true);
    });

    it("plain `f()` sets `optional = false`", () => {
      const { opsAdded } = buildCallFromSource("f();");
      const call = opsAdded.find(
        (o): o is CallExpressionOp => o instanceof CallExpressionOp,
      )!;
      expect(call.optional).toBe(false);
    });

    it("`obj?.m()` is optional on the MEMBER load, not the call", () => {
      // The `?.` binds to the member access, not the call. The call
      // itself is non-optional in ESTree's model — only the property
      // load carries the optional flag.
      const { opsAdded } = buildCallFromSource("obj?.m();");
      const load = opsAdded.find(
        (o): o is LoadStaticPropertyOp => o instanceof LoadStaticPropertyOp,
      )!;
      const call = opsAdded.find(
        (o): o is CallExpressionOp => o instanceof CallExpressionOp,
      )!;
      expect(load.optional).toBe(true);
      expect(call.optional).toBe(false);
    });
  });

  describe("getOperands", () => {
    it("includes callee then args in order", () => {
      const { opsAdded } = buildCallFromSource("f(1, 2);");
      const call = opsAdded.find(
        (o): o is CallExpressionOp => o instanceof CallExpressionOp,
      )!;
      const operands = call.getOperands();
      expect(operands[0]).toBe(call.callee);
      expect(operands.slice(1)).toEqual(call.args);
    });
  });
});

// -----------------------------------------------------------------
// super — requires class-method context, end-to-end only.
// -----------------------------------------------------------------

describe("buildCallExpression — super", () => {
  it("`super(1)` inside a derived constructor emits SuperCallOp", () => {
    const source = "class C extends B { constructor(x) { super(x); } }";
    const unit = new ProjectBuilder().buildFromSource(source, "m.js");
    const mod = unit.modules.get("m.js")!;

    let superCall: SuperCallOp | undefined;
    for (const fn of mod.functions.values()) {
      for (const block of fn.allBlocks()) {
        for (const op of block.operations) {
          if (op instanceof SuperCallOp) {
            superCall = op;
            break;
          }
        }
      }
    }
    expect(superCall).toBeDefined();
    expect(superCall!.args.length).toBe(1);
  });
});
